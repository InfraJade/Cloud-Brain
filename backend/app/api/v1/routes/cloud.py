"""Inventory and cost routes — pass-through to the AWS Lambda routes (BACKEND-API.md §4.1–4.4).

Query parameters and bodies go through untouched: the backend validates them and rejects
unknown parameters with a 400 whose message is safe to show. AWS status codes are passed
through as well; a route that isn't deployed yet answers 404 with ``not_deployed: true``.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from ....core.config import settings
from ....core.rate_limit import limiter
from ....core.security import User, get_current_user
from ....services.chatops import chatops_service
from ....services.chatops.chatops_service import UpstreamError
from .chatops import upstream_http_error

router = APIRouter()


async def _get(path: str, request: Request):
    try:
        return await chatops_service.insights("GET", path, params=dict(request.query_params))
    except UpstreamError as exc:
        raise upstream_http_error(exc)


@router.get("/inventory")
@limiter.limit("30/minute")
async def inventory(request: Request, current_user: User = Depends(get_current_user)):
    """Counts of EC2, RDS, EKS, ECS, Lambda, DynamoDB and S3 (optional ?regions=)."""
    return await _get(settings.CHATOPS_INVENTORY_PATH, request)


@router.get("/cost/current")
@limiter.limit("30/minute")
async def cost_current(request: Request, current_user: User = Depends(get_current_user)):
    """Month-to-date spend (group_by, metric, exclude_credits and filters as query parameters)."""
    return await _get(settings.CHATOPS_COST_CURRENT_PATH, request)


@router.get("/cost/forecast")
@limiter.limit("30/minute")
async def cost_forecast(request: Request, current_user: User = Depends(get_current_user)):
    """Projected month-end spend with an 80% prediction interval."""
    return await _get(settings.CHATOPS_COST_FORECAST_PATH, request)


@router.post("/cost/report")
@limiter.limit("10/minute")
async def cost_report(request: Request, current_user: User = Depends(get_current_user)):
    """Spend for any date range, with CSV and HTML download links (they expire in about an hour)."""
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Body must be JSON.")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object.")
    try:
        return await chatops_service.insights("POST", settings.CHATOPS_COST_REPORT_PATH, body=body)
    except UpstreamError as exc:
        raise upstream_http_error(exc)
