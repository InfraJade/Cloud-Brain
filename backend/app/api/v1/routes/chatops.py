"""Provisioning, registry and assistant routes.

The browser never calls the AWS API Gateway directly (no CORS there, and the AWS read
credentials must stay server-side). All routes require a signed-in CLOUD BRAIN user.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ....core.config import settings
from ....core.rate_limit import limiter
from ....core.security import User, get_current_user
from ....services.chatops import chatops_service
from ....services.chatops.chatops_service import ChatOpsValidationError, RegistryUnavailable, UpstreamError
from ....services.chatops.validation import (
    INSTANCE_TYPES,
    OS_OPTIONS,
    REQUEST_ID_RE,
    RESOURCE_ID_RE,
    RESOURCE_TYPES,
    sanitize_person,
)

router = APIRouter()


def upstream_http_error(exc: UpstreamError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail={"message": exc.message, "not_deployed": exc.not_deployed})


class ProvisionRequest(BaseModel):
    project: str
    resource_type: str
    request_id: str
    env: Optional[str] = None
    instance_type: Optional[str] = None
    os_name: Optional[str] = None
    approver_name: Optional[str] = None


class DeleteRequest(BaseModel):
    delete_ticket_id: str
    resource_id: Optional[str] = None
    request_id: Optional[str] = None
    resource_type: Optional[str] = None
    env: Optional[str] = None


class AgentChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: Optional[str] = None            # chat turn
    action_id: Optional[str] = None          # confirm/cancel a proposed action
    decision: Optional[str] = None           # "confirm" | "cancel"
    status_request_id: Optional[str] = None  # track a confirmed action


@router.get("/config")
async def get_config(current_user: User = Depends(get_current_user)):
    """Non-sensitive config the frontend uses for forms and the Settings page."""
    return {
        "endpoint": settings.CHATOPS_API_URL,
        "agent_endpoint": settings.CHATOPS_AGENT_API_URL or settings.CHATOPS_API_URL,
        "region": settings.AWS_REGION,
        "dynamodb_table": settings.CHATOPS_DYNAMODB_TABLE,
        "direct_read_configured": settings.direct_read_configured,
        "api_key_configured": bool(settings.CHATOPS_API_KEY),
        "resource_types": list(RESOURCE_TYPES),
        "environments": settings.allowed_envs,
        "instance_types": list(INSTANCE_TYPES),
        "os_options": list(OS_OPTIONS),
    }


@router.post("/agent")
@limiter.limit("30/minute")
async def agent_chat(request: Request, data: AgentChatRequest, current_user: User = Depends(get_current_user)):
    """AI assistant — proxies POST /agent and passes its status codes through
    (404 unknown action, 409 already handled, 410 expired, 502 workflow/agent failure)."""
    try:
        return await chatops_service.agent_chat(data.model_dump())
    except ChatOpsValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except UpstreamError as exc:
        raise upstream_http_error(exc)


@router.post("/provision")
@limiter.limit("20/minute")
async def provision_resource(request: Request, data: ProvisionRequest, current_user: User = Depends(get_current_user)):
    payload = data.model_dump(exclude_none=True)
    # Always the signed-in user, never a value from the browser.
    payload["requester_name"] = sanitize_person(current_user.full_name)
    try:
        return await chatops_service.provision(payload)
    except ChatOpsValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except UpstreamError as exc:
        raise upstream_http_error(exc)


@router.get("/resources")
@limiter.limit("40/minute")
async def list_resources(request: Request, current_user: User = Depends(get_current_user)):
    return await chatops_service.list_resources()


@router.get("/status")
@limiter.limit("60/minute")
async def request_status(
    request: Request,
    request_id: Optional[str] = Query(default=None),
    resource_id: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """Records for a provisioning request (or one resource name) as plain JSON — the
    lookup the spec asks for while the API's own GET /status can't return data."""
    if not request_id and not resource_id:
        raise HTTPException(status_code=400, detail="Give a request_id or a resource_id.")
    if request_id and not REQUEST_ID_RE.match(request_id):
        raise HTTPException(status_code=400, detail="request_id must be 3–64 characters from A-Z a-z 0-9 . _ : -")
    if resource_id and not RESOURCE_ID_RE.match(resource_id):
        raise HTTPException(status_code=400, detail="resource_id contains characters that aren't allowed.")
    try:
        return await chatops_service.request_status(request_id=request_id, resource_id=resource_id)
    except RegistryUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.delete("/resources")
@limiter.limit("20/minute")
async def delete_resource(request: Request, data: DeleteRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can de-provision resources.")
    try:
        return await chatops_service.delete_resource(data.model_dump(exclude_none=True))
    except ChatOpsValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except UpstreamError as exc:
        raise upstream_http_error(exc)
