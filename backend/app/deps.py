import uuid
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import Boolean, DateTime, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)
# The signing keys are kept for an hour. A token signed with a key not seen yet makes the
# client fetch the keys again at once, so a key rotation still works straight away.
jwks_client = PyJWKClient(settings.supabase_jwks_url, lifespan=3600)

# The apps look for this exact text to recognise a turned-off account, so do
# not reword it without changing them too.
ACCOUNT_OFF_MESSAGE = "This account is turned off."

# The profile and the ban, in one round trip. A Supabase ban lives on the auth user
# (banned_until), not on our profile, and tokens that were already issued keep working
# until they expire, so the ban is checked on every request. A user who was never banned
# (NULL), or has no auth row, counts as "not banned".
CURRENT_USER_QUERY = text("""
    select p.id, p.name, p.role, p.is_active, p.class_id, p.is_admin, p.created_at,
           coalesce((select u.banned_until > now() from auth.users u where u.id = p.id), false)
               as banned
    from profiles p
    where p.id = :id
""").columns(
    id=UUID(as_uuid=True),
    is_active=Boolean,
    is_admin=Boolean,
    created_at=DateTime(timezone=True),
    banned=Boolean,
)


def _keys_unreachable() -> HTTPException:
    # Supabase's key list could not be fetched, so the token could not be checked either
    # way. Refused, but as "try again" rather than "logged out": a 401 here would sign
    # every student out during a short outage.
    return HTTPException(status_code=503, detail="Sign-in check unavailable. Please try again.")


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
            # A clock a moment behind Supabase's would refuse a brand-new token, and
            # bounce a student straight back out at their very first login.
            leeway=10,
        )
    except jwt.PyJWKClientConnectionError:
        raise _keys_unreachable()
    except jwt.PyJWTError:
        raise _invalid_token()

    try:
        profile_id = uuid.UUID(payload.get("sub", ""))
    except ValueError:
        raise _invalid_token()

    profile = db.execute(CURRENT_USER_QUERY, {"id": profile_id}).first()
    if profile is None:
        raise _invalid_token()

    # A turned-off account is refused even when its token is still valid:
    # either our own flag is off, or Supabase has the user banned.
    if not profile.is_active or profile.banned:
        raise HTTPException(status_code=403, detail=ACCOUNT_OFF_MESSAGE)

    return {
        "id": str(profile.id),
        "name": profile.name,
        "email": payload.get("email"),
        "role": profile.role,
        "is_active": profile.is_active,
        "created_at": profile.created_at,
        "class_id": profile.class_id,
        "is_admin": profile.is_admin,
    }


def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    return user


def require_student(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    # The flag comes from the database on this request, never from the client.
    # Anyone else gets the same 404 as a route that does not exist.
    if not user["is_admin"]:
        raise HTTPException(status_code=404, detail="Not found")
    return user
