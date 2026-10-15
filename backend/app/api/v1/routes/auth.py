from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from ....core.config import settings
from ....core.rate_limit import limiter
from ....core.security import User, authenticate, create_access_token, get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest):
    if not settings.CLOUD_BRAIN_USERS.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No users are configured. Set CLOUD_BRAIN_USERS in backend/.env.",
        )
    user = authenticate(data.email, data.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials. Please try again.")
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "expires_in": settings.JWT_EXPIRE_MINUTES * 60,
        "user": user.public(),
    }


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return current_user.public()
