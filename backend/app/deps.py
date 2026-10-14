import uuid
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Profile

bearer_scheme = HTTPBearer(auto_error=False)
jwks_client = PyJWKClient(settings.supabase_jwks_url)


def _invalid_token() -> HTTPException:
    # A fresh exception every time. Raising one shared object over and over
    # makes Python keep growing its traceback, which holds memory.
    return HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> dict:
    if credentials is None:
        raise _invalid_token()

    token = credentials.credentials

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=settings.supabase_issuer,
        )
    except jwt.PyJWTError:
        raise _invalid_token()

    try:
        profile_id = uuid.UUID(payload.get("sub", ""))
    except ValueError:
        raise _invalid_token()

    profile = db.get(Profile, profile_id)
    if profile is None:
        raise _invalid_token()

    # A deactivated account is refused even when its token is still valid.
    if not profile.is_active:
        raise HTTPException(status_code=403, detail="This account is turned off.")

    return {
        "id": str(profile.id),
        "name": profile.name,
        "email": payload.get("email"),
        "role": profile.role,
        "is_active": profile.is_active,
        "created_at": profile.created_at,
        "class_id": profile.class_id,
    }


def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    return user


def require_student(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")
    return user