import uuid
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Profile

bearer_scheme = HTTPBearer(auto_error=False)
jwks_client = PyJWKClient(settings.supabase_jwks_url)

# The apps look for this exact text to recognise a turned-off account, so do
# not reword it without changing them too.
ACCOUNT_OFF_MESSAGE = "This account is turned off."

# A Supabase ban lives on the auth user (banned_until), not on our profile, and
# tokens that were already issued keep working until they expire. So the ban is
# checked on every request. A user who was never banned gives NULL, which is
# treated as "not banned".
BANNED_QUERY = text("select banned_until > now() from auth.users where id = :id")


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

    # A turned-off account is refused even when its token is still valid:
    # either our own flag is off, or Supabase has the user banned.
    banned = db.execute(BANNED_QUERY, {"id": profile_id}).scalar()
    if not profile.is_active or banned:
        raise HTTPException(status_code=403, detail=ACCOUNT_OFF_MESSAGE)

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