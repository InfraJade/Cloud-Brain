"""Direct reads of the resource registry (DynamoDB ``aws-ops-resources``).

The API's own read route (``GET /status``) is a Step Functions route that can't return
data to a caller, so the resource list and request status are read here instead.

Table layout (BACKEND-API.md §6): partition key ``resource_id``, secondary index
``request_id-index``. CodeBuild writes a record after ``terraform apply`` and deletes it
after ``terraform destroy``. Older records written by the previous pipeline also exist
(``status: PENDING_PROVISION``, ``project_env: "<project>#<env>"``).

Two credential modes are supported:

* **Static IAM user keys** — CHATOPS_AWS_ACCESS_KEY_ID / CHATOPS_AWS_SECRET_ACCESS_KEY.
* **Assume-role** — CHATOPS_AWS_ROLE_ARN (base credentials from boto3's normal chain or
  CHATOPS_AWS_PROFILE; that identity must be trusted by the role).

Static keys take precedence when both are set.
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Optional

import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

from ...core.config import settings
from ...utils.logger import logger

_ROLE_SESSION_MARGIN_SECONDS = 300  # refresh 5 min before actual expiry

_credentials_lock = asyncio.Lock()
_cached_credentials: Optional[dict[str, str]] = None
_cached_expiry_epoch: float = 0.0


class AwsAccessError(Exception):
    """Raised when the assume-role or DynamoDB read fails."""


def _assume_role_sync() -> dict[str, Any]:
    if not settings.CHATOPS_AWS_ROLE_ARN:
        raise AwsAccessError("CHATOPS_AWS_ROLE_ARN is not configured.")

    session = boto3.Session(profile_name=settings.CHATOPS_AWS_PROFILE or None)
    sts = session.client("sts", region_name=settings.AWS_REGION)
    kwargs: dict[str, Any] = {
        "RoleArn": settings.CHATOPS_AWS_ROLE_ARN,
        "RoleSessionName": settings.CHATOPS_AWS_ROLE_SESSION_NAME,
    }
    if settings.CHATOPS_AWS_EXTERNAL_ID:
        kwargs["ExternalId"] = settings.CHATOPS_AWS_EXTERNAL_ID

    creds = sts.assume_role(**kwargs)["Credentials"]
    return {
        "aws_access_key_id": creds["AccessKeyId"],
        "aws_secret_access_key": creds["SecretAccessKey"],
        "aws_session_token": creds["SessionToken"],
        "_expiration_epoch": creds["Expiration"].timestamp(),
    }


def _static_credentials() -> Optional[dict[str, str]]:
    if settings.CHATOPS_AWS_ACCESS_KEY_ID and settings.CHATOPS_AWS_SECRET_ACCESS_KEY:
        return {
            "aws_access_key_id": settings.CHATOPS_AWS_ACCESS_KEY_ID,
            "aws_secret_access_key": settings.CHATOPS_AWS_SECRET_ACCESS_KEY,
        }
    return None


async def _get_credentials() -> dict[str, str]:
    static = _static_credentials()
    if static is not None:
        return static

    global _cached_credentials, _cached_expiry_epoch
    async with _credentials_lock:
        if _cached_credentials is None or time.time() >= _cached_expiry_epoch - _ROLE_SESSION_MARGIN_SECONDS:
            try:
                creds = await asyncio.to_thread(_assume_role_sync)
            except Exception as exc:
                raise AwsAccessError(f"Could not assume role {settings.CHATOPS_AWS_ROLE_ARN}: {exc}") from exc
            _cached_expiry_epoch = creds.pop("_expiration_epoch")
            _cached_credentials = creds
            logger.info(f"Assumed role {settings.CHATOPS_AWS_ROLE_ARN} for registry reads")
        return _cached_credentials


# One low-level client per set of credentials (clients are thread-safe; building one costs
# ~1–2 s, so it is reused across calls and rebuilt only when assumed-role credentials rotate).
_client_lock = threading.Lock()
_client_cache: dict[tuple, Any] = {}
_deserializer = TypeDeserializer()


def _ddb(creds: dict[str, str]):
    key = (creds.get("aws_access_key_id"), creds.get("aws_session_token"))
    with _client_lock:
        client = _client_cache.get(key)
        if client is None:
            _client_cache.clear()
            client = boto3.client("dynamodb", region_name=settings.AWS_REGION, **creds)
            _client_cache[key] = client
        return client


def _plain(item: dict) -> dict:
    """DynamoDB typed JSON ({"S": "x"}) → plain values."""
    return {k: _deserializer.deserialize(v) for k, v in item.items()}


def _paginate(client, operation: str, **kwargs) -> list[dict]:
    items: list[dict] = []
    for page in client.get_paginator(operation).paginate(TableName=settings.CHATOPS_DYNAMODB_TABLE, **kwargs):
        items.extend(_plain(i) for i in page.get("Items", []))
    return items


def _error_code(exc: ClientError) -> str:
    return exc.response.get("Error", {}).get("Code", "")


def _scan_sync(creds: dict[str, str]) -> list[dict]:
    return _paginate(_ddb(creds), "scan")


def _by_request_sync(creds: dict[str, str], request_id: str) -> list[dict]:
    client = _ddb(creds)
    values = {":r": {"S": request_id}}
    try:
        return _paginate(
            client,
            "query",
            IndexName=settings.CHATOPS_DYNAMODB_REQUEST_INDEX,
            KeyConditionExpression="request_id = :r",
            ExpressionAttributeValues=values,
        )
    except ClientError as exc:
        # Index missing or named differently: fall back to a filtered scan (small table).
        if _error_code(exc) not in ("ValidationException", "ResourceNotFoundException"):
            raise
        logger.warning(f"request_id index query failed ({_error_code(exc)}); falling back to a scan")
        return _paginate(client, "scan", FilterExpression="request_id = :r", ExpressionAttributeValues=values)


def _by_resource_sync(creds: dict[str, str], resource_id: str) -> list[dict]:
    client = _ddb(creds)
    try:
        item = client.get_item(TableName=settings.CHATOPS_DYNAMODB_TABLE, Key={"resource_id": {"S": resource_id}}).get("Item")
        return [_plain(item)] if item else []
    except ClientError as exc:
        if _error_code(exc) != "ValidationException":
            raise
        return _paginate(client, "scan", FilterExpression="resource_id = :id", ExpressionAttributeValues={":id": {"S": resource_id}})


async def _run(fn, *args) -> list[dict]:
    creds = await _get_credentials()
    try:
        return await asyncio.to_thread(fn, creds, *args)
    except Exception as exc:
        raise AwsAccessError(f"Read of '{settings.CHATOPS_DYNAMODB_TABLE}' failed: {exc}") from exc


async def fetch_resources() -> list[dict]:
    """Every record in the registry."""
    return await _run(_scan_sync)


async def fetch_by_request(request_id: str) -> list[dict]:
    """Records created by one provisioning request (usually one)."""
    return await _run(_by_request_sync, request_id)


async def fetch_by_resource(resource_id: str) -> list[dict]:
    """The record for one resource name, if it still exists."""
    return await _run(_by_resource_sync, resource_id)
