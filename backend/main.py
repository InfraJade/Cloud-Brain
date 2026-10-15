"""CLOUD BRAIN API — a thin proxy between the CLOUD BRAIN frontend and the AWS ChatOps backend.

Run from the project root:
    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080
"""

from pathlib import Path

from dotenv import load_dotenv

# Load .env from the backend directory regardless of where uvicorn is launched from.
load_dotenv(Path(__file__).parent / ".env")

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .app.api.v1.routes.auth import router as auth_router
from .app.api.v1.routes.chatops import router as chatops_router
from .app.api.v1.routes.cloud import router as cloud_router
from .app.core.config import settings
from .app.core.rate_limit import limiter
from .app.services.chatops.chatops_service import close_client
from .app.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_client()  # release the pooled connection to the AWS API

app = FastAPI(
    title="CLOUD BRAIN API",
    description="Proxy for the AWS Cloud Brain API: provisioning (EC2 / S3), inventory, costs and the AI assistant",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Rate limiter must be attached to app state before SlowAPIMiddleware is added.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/healthz")
async def healthz():
    return {"status": "ok", "service": "cloud-brain"}


app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chatops_router, prefix="/api/v1/chatops", tags=["chatops"])
app.include_router(cloud_router, prefix="/api/v1/cloud", tags=["cloud"])

if not settings.CLOUD_BRAIN_USERS.strip():
    logger.warning("CLOUD_BRAIN_USERS is empty — nobody can sign in. Set it in backend/.env.")
if not settings.direct_read_configured:
    logger.warning("No AWS read credentials (CHATOPS_AWS_*) — the resource list and request status are unavailable.")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
