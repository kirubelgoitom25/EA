from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.stub_data import STUB_USERS

bearer_scheme = HTTPBearer(auto_error=False)

TOKEN_PREFIX = "stub-token-"


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    invalid = HTTPException(status_code=401, detail="Invalid or expired token")

    if credentials is None or not credentials.credentials.startswith(TOKEN_PREFIX):
        raise invalid

    try:
        user_id = int(credentials.credentials[len(TOKEN_PREFIX) :])
    except ValueError:
        raise invalid

    for user in STUB_USERS:
        if user["id"] == user_id:
            return user

    raise invalid


def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    return user
