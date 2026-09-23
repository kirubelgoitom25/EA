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

INVALID_TOKEN = HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> dict:
    if credentials is None:
        raise INVALID_TOKEN

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
        raise INVALID_TOKEN

    try:
        profile_id = uuid.UUID(payload.get("sub", ""))
    except ValueError:
        raise INVALID_TOKEN

    profile = db.get(Profile, profile_id)
    if profile is None:
        raise INVALID_TOKEN

    return {
        "id": str(profile.id),
        "name": profile.name,
        "email": payload.get("email"),
        "role": profile.role,
        "is_active": profile.is_active,
        "created_at": profile.created_at,
    }


def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    return user
