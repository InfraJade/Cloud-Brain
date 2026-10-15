"""Bridge between CLOUD BRAIN and the AWS Cloud Brain API (docs/BACKEND-API.md).

* ``/provision`` and ``/resource`` are Step Functions routes: they are asynchronous and
  return an execution receipt as soon as the request is accepted. The resource appears
  (or disappears) minutes later, after CodeBuild runs Terraform.
* ``/agent``, ``/inventory`` and ``/cost/*`` are Lambda routes that answer with JSON and
  report errors as ``{"error": "..."}`` with a meaningful status code, which is passed
  through to the browser unchanged so the UI can react as the spec describes.
* Status and the resource list are read from DynamoDB directly (see ``aws_dynamodb``).
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

from ...core.config import settings
from ...utils.logger import logger
from . import aws_dynamodb
from .validation import (
    DEFAULT_APPROVER,
    INSTANCE_TYPES,
    OS_OPTIONS,
    PERSON_RE,
    PROJECT_RE,
    REQUEST_ID_RE,
    RESOURCE_ID_RE,
    RESOURCE_TYPES,
)


class UpstreamError(Exception):
    """A non-2xx answer (or no answer) from the AWS API, with the status to pass on."""

    def __init__(self, status: int, message: str, not_deployed: bool = False):
        super().__init__(message)
        self.status = status
        self.message = message
        self.not_deployed = not_deployed


class ChatOpsValidationError(ValueError):
    """Raised when a request fails the field rules, before anything is sent to AWS."""


class RegistryUnavailable(Exception):
    """Raised when the resource registry can't be read (no AWS read access configured)."""


# One pooled client for the life of the process: reusing the TLS connection to API Gateway
# saves ~0.5–1.5 s per call compared with opening a new one each time.
_http_client: Optional[httpx.AsyncClient] = None


def _client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=settings.CHATOPS_REQUEST_TIMEOUT,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=60),
        )
    return _http_client


async def close_client() -> None:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
    _http_client = None


def _url(path: str, base_url: Optional[str] = None) -> str:
    base = (base_url or settings.CHATOPS_API_URL).rstrip("/")
    return f"{base}/{path.lstrip('/')}"


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.CHATOPS_API_KEY:
        headers["x-api-key"] = settings.CHATOPS_API_KEY
    return headers


# ── Provision / delete ───────────────────────────────────────────────────────


def build_provision_body(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate against §7 and build the exact body the workflow expects."""
    project = str(payload.get("project") or "").strip()
    resource_type = str(payload.get("resource_type") or "").strip().lower()
    env = str(payload.get("env") or "dev").strip().lower()
    request_id = str(payload.get("request_id") or "").strip()
    requester = str(payload.get("requester_name") or "unknown").strip()
    approver = str(payload.get("approver_name") or DEFAULT_APPROVER).strip()

    errors: list[str] = []
    if not PROJECT_RE.match(project):
        errors.append(
            "Project must be 3–30 characters of lowercase letters, digits and hyphens, "
            "starting and ending with a letter or digit."
        )
    if resource_type not in RESOURCE_TYPES:
        errors.append("Resource type must be ec2 or s3.")
    if env not in settings.allowed_envs:
        errors.append(f"Environment must be one of: {', '.join(settings.allowed_envs)}.")
    if not REQUEST_ID_RE.match(request_id):
        errors.append("Request ID must be 3–64 characters from A-Z a-z 0-9 . _ : -")
    if not PERSON_RE.match(requester):
        errors.append("Requester may only contain letters, digits, spaces and . _ @ - (max 64).")
    if not PERSON_RE.match(approver):
        errors.append("Approver may only contain letters, digits, spaces and . _ @ - (max 64).")

    body: dict[str, Any] = {
        "project": project,
        "env": env,
        "resource_type": resource_type,
        "request_id": request_id,
        "requester_name": requester,
        "approver_name": approver,
    }
    if resource_type == "ec2":
        instance_type = str(payload.get("instance_type") or "t3.micro").strip()
        os_name = str(payload.get("os_name") or "ubuntu").strip().lower()
        if instance_type not in INSTANCE_TYPES:
            errors.append(f"Instance type must be one of the approved types: {', '.join(INSTANCE_TYPES)}.")
        if os_name not in OS_OPTIONS:
            errors.append(f"Operating system must be one of: {', '.join(OS_OPTIONS)}.")
        body["instance_type"] = instance_type
        body["os_name"] = os_name

    if errors:
        raise ChatOpsValidationError(" ".join(errors))
    return body


async def provision(payload: dict[str, Any]) -> dict[str, Any]:
    body = build_provision_body(payload)
    receipt = await _call_upstream("POST", settings.CHATOPS_PROVISION_PATH, json_body=body, add_http_method=True)
    return {
        "status": "accepted",
        "request_id": body["request_id"],
        "execution_arn": receipt.get("executionArn"),
        "message": (
            f"{body['resource_type'].upper()} request {body['request_id']} accepted. "
            "The resource appears a few minutes after Terraform runs."
        ),
    }


def build_delete_body(payload: dict[str, Any]) -> dict[str, Any]:
    """Identify the resource by resource_id (preferred: exact) or by the provisioning request ID."""
    resource_id = str(payload.get("resource_id") or "").strip()
    request_id = str(payload.get("request_id") or payload.get("original_provision_ticket_id") or "").strip()
    delete_ticket_id = str(payload.get("delete_ticket_id") or "").strip()

    if not resource_id and not request_id:
        raise ChatOpsValidationError("Give the resource_id (preferred) or the provisioning request_id.")
    if resource_id and not RESOURCE_ID_RE.match(resource_id):
        raise ChatOpsValidationError("resource_id contains characters the backend doesn't accept.")
    if request_id and not REQUEST_ID_RE.match(request_id):
        raise ChatOpsValidationError("request_id must be 3–64 characters from A-Z a-z 0-9 . _ : -")
    if not REQUEST_ID_RE.match(delete_ticket_id):
        raise ChatOpsValidationError("delete_ticket_id must be 3–64 characters from A-Z a-z 0-9 . _ : -")

    body: dict[str, Any] = {"delete_ticket_id": delete_ticket_id}
    if resource_id:
        body["resource_id"] = resource_id
    else:
        body["request_id"] = request_id
    # Fallbacks, used by the backend only when no record exists.
    resource_type = str(payload.get("resource_type") or "").strip().lower()
    if resource_type in RESOURCE_TYPES:
        body["resource_type"] = resource_type
    env = str(payload.get("env") or "").strip().lower()
    if env:
        body["env"] = env
    return body


async def delete_resource(payload: dict[str, Any]) -> dict[str, Any]:
    body = build_delete_body(payload)
    receipt = await _call_upstream("DELETE", settings.CHATOPS_DELETE_PATH, json_body=body, add_http_method=True)
    target = body.get("resource_id") or body.get("request_id")
    return {
        "status": "accepted",
        "resource_id": body.get("resource_id"),
        "request_id": body.get("request_id"),
        "delete_ticket_id": body["delete_ticket_id"],
        "execution_arn": receipt.get("executionArn"),
        "message": f"Deletion of {target} accepted. The record disappears once Terraform has destroyed it.",
    }


# ── Registry reads ───────────────────────────────────────────────────────────


async def list_resources() -> dict[str, Any]:
    if not settings.direct_read_configured:
        return {
            "resources": [],
            "source": "unavailable",
            "message": "The resource list needs AWS read access (CHATOPS_AWS_* in backend/.env).",
        }
    try:
        items = await aws_dynamodb.fetch_resources()
    except aws_dynamodb.AwsAccessError as exc:
        logger.warning(f"Registry scan failed: {exc}")
        return {"resources": [], "source": "unavailable", "message": f"The resource list is unavailable: {exc}"}
    return {"resources": items, "source": "dynamodb", "message": f"{len(items)} resource(s) found."}


async def request_status(request_id: Optional[str] = None, resource_id: Optional[str] = None) -> dict[str, Any]:
    """Records for a provisioning request (or for one resource name), as plain JSON.

    No records means: still being created, never created (failed), or already deleted —
    the backend can't tell these apart yet (issue 5)."""
    if not settings.direct_read_configured:
        raise RegistryUnavailable("Status lookups need AWS read access (CHATOPS_AWS_* in backend/.env).")
    try:
        if resource_id:
            items = await aws_dynamodb.fetch_by_resource(resource_id)
        else:
            items = await aws_dynamodb.fetch_by_request(request_id or "")
    except aws_dynamodb.AwsAccessError as exc:
        raise RegistryUnavailable(str(exc)) from exc
    return {
        "request_id": request_id,
        "resource_id": resource_id,
        "found": bool(items),
        "resources": items,
    }


# ── Agent and insights (Lambda routes) ───────────────────────────────────────


async def agent_chat(payload: dict[str, Any]) -> dict[str, Any]:
    """One turn against POST /agent. Three body shapes: chat {message},
    decision {action_id, decision}, tracking {status_request_id}. session_id is omitted on
    the first message; the agent issues one, which the UI sends back afterwards."""
    body: dict[str, Any] = {}
    if payload.get("session_id"):
        body["session_id"] = payload["session_id"]
    if payload.get("action_id") or payload.get("decision"):
        if payload.get("decision") not in ("confirm", "cancel") or not payload.get("action_id"):
            raise ChatOpsValidationError("A decision needs an action_id and decision 'confirm' or 'cancel'.")
        body.update(action_id=payload["action_id"], decision=payload["decision"])
    elif payload.get("status_request_id"):
        body["status_request_id"] = payload["status_request_id"]
    else:
        message = str(payload.get("message") or "").strip()
        if not message:
            raise ChatOpsValidationError("message is required.")
        body["message"] = message

    return await _call_upstream(
        "POST",
        settings.CHATOPS_AGENT_PATH,
        json_body=body,
        base_url=settings.CHATOPS_AGENT_API_URL or None,
        timeout=settings.CHATOPS_AGENT_TIMEOUT,
    )


async def insights(method: str, path: str, params: Optional[dict] = None, body: Optional[dict] = None) -> Any:
    """Pass-through for GET /inventory, GET /cost/current, GET /cost/forecast, POST /cost/report.
    Parameters go through untouched: the backend rejects unknown ones with a 400."""
    return await _call_upstream(method, path, params=params, json_body=body, timeout=settings.CHATOPS_INSIGHTS_TIMEOUT)


# ── Transport ────────────────────────────────────────────────────────────────


async def _call_upstream(
    method: str,
    path: str,
    *,
    json_body: Optional[dict] = None,
    params: Optional[dict] = None,
    base_url: Optional[str] = None,
    add_http_method: bool = False,
    timeout: Optional[int] = None,
) -> dict[str, Any]:
    url = _url(path, base_url)
    # The Step Functions routes read "httpMethod" from the JSON body itself to pick the branch.
    if add_http_method:
        json_body = {**(json_body or {}), "httpMethod": method}
    # Headers are not logged — CHATOPS_API_KEY, if set, would live there.
    logger.info("AWS request: %s %s | params=%s | body=%s", method, url, params, json_body)
    try:
        response = await _client().request(
            method, url, json=json_body, params=params, headers=_headers(),
            timeout=timeout or settings.CHATOPS_REQUEST_TIMEOUT,
        )
    except httpx.TimeoutException as exc:
        raise UpstreamError(504, "The AWS endpoint timed out. Please try again.") from exc
    except httpx.HTTPError as exc:
        raise UpstreamError(502, f"Could not reach the AWS endpoint: {exc}") from exc

    logger.info("AWS response: %s %s -> %s | %s", method, url, response.status_code, response.text[:500])
    try:
        data: Any = response.json()
    except ValueError:
        data = {"raw_text": response.text}

    if response.status_code >= 400:
        raise _upstream_error(method, path, response.status_code, data)
    return data if isinstance(data, dict) else {"data": data}


def _upstream_error(method: str, path: str, status: int, data: Any) -> UpstreamError:
    body = data if isinstance(data, dict) else {}
    lambda_error = body.get("error")
    # API Gateway answers {"message": "Not Found"} for a route that doesn't exist yet.
    if status == 404 and not lambda_error and body.get("message") == "Not Found":
        return UpstreamError(404, f"Not available yet: {method} {path} isn't deployed on AWS yet.", not_deployed=True)
    if status in (401, 403) and not lambda_error:
        # Never pass a 401 through: the UI treats 401 as "your CLOUD BRAIN session ended".
        return UpstreamError(403, "Not available: AWS refused the request (authorizer or missing permission).")
    if status == 401:
        status = 403
    message = lambda_error or body.get("message") or f"The AWS endpoint returned {status}."
    return UpstreamError(status, str(message))
