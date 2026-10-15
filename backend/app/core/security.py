"""Lightweight auth for CLOUD BRAIN — no database.

Users are declared in ``CLOUD_BRAIN_USERS`` (see config.py) and sessions are
stateless JWTs. This only gates the local proxy so that nobody who can reach
the port can provision/delete AWS resources anonymously.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import settings

security = HTTPBearer(auto_error=False)

VALID_ROLES = {"admin", "operator"}


@dataclass(frozen=True)
class User:
    user_id: str
    email: str
    full_name: str
    role: str

    def public(self) -> dict[str, Any]:
        return asdict(self)


def _parse_users(raw: str) -> dict[str, tuple[User, str]]:
    """Parse "email:password:Full Name:role;..." into {email: (User, password)}."""
    users: dict[str, tuple[User, str]] = {}
    for entry in raw.split(";"):
        parts = entry.strip().split(":")
        if len(parts) < 2 or not parts[0].strip():
            continue
        email = parts[0].strip().lower()
        full_name = parts[2].strip() if len(parts) > 2 and parts[2].strip() else email.split("@")[0]
        role = parts[3].strip().lower() if len(parts) > 3 else "operator"
        if role not in VALID_ROLES:
            role = "operator"
        users[email] = (User(user_id=email, email=email, full_name=full_name, role=role), parts[1])
    return users


def authenticate(email: str, password: str) -> Optional[User]:
    record = _parse_users(settings.CLOUD_BRAIN_USERS).get(email.strip().lower())
    if record is None:
        return None
    user, expected = record
    return user if compare_digest(password.encode(), expected.encode()) else None


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode({**user.public(), "exp": expire}, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    # Re-check the user list so removing someone from CLOUD_BRAIN_USERS revokes access.
    record = _parse_users(settings.CLOUD_BRAIN_USERS).get(str(payload.get("email", "")).lower())
    if record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer has access")
    return record[0]
