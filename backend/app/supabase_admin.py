"""The few Supabase Auth admin calls the backend makes, with the service key.

Public sign-up stays off in Supabase, so this is the only way a student account is made:
every sign-up passes our own checks first. Tests replace create_user, set_password and
delete_user with a fake.
"""
import logging
from typing import Optional

import httpx

from app.config import settings

TIMEOUT_SECONDS = 20

log = logging.getLogger("ea.auth_admin")


class AuthAdminError(Exception):
    """Supabase refused or could not be reached. Never carries the key or a password.

    status is Supabase's HTTP status (0 when it could not be reached), code its error code.
    """

    def __init__(self, status: int, code: Optional[str] = None):
        super().__init__(f"auth admin answered {status} {code or ''}".strip())
        self.status = status
        self.code = code


def _headers() -> dict:
    key = settings.supabase_service_role_key
    if not key:
        raise AuthAdminError(0, "service_key_missing")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _send(method: str, path: str, body: Optional[dict] = None) -> dict:
    try:
        response = httpx.request(
            method,
            f"{settings.supabase_url}/auth/v1/admin/{path}",
            headers=_headers(),
            json=body if body is not None else None,
            timeout=TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as error:
        raise AuthAdminError(0, type(error).__name__) from None
    if response.status_code >= 300:
        code = None
        try:
            payload = response.json()
            code = payload.get("error_code") or payload.get("code")
        except ValueError:
            pass
        raise AuthAdminError(response.status_code, str(code) if code else None)
    try:
        return response.json()
    except ValueError:
        return {}


def create_user(email: str, password: str, user_metadata: dict, app_metadata: dict) -> str:
    """Creates a confirmed user and returns its id. app_metadata can only be set with the
    service key, which is why the account triggers read username, phone and school from
    there. Supabase inserts the user first and applies app_metadata in a second UPDATE of
    the same transaction, so it is the UPDATE trigger that writes them."""
    user = _send(
        "POST",
        "users",
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": user_metadata,
            "app_metadata": app_metadata,
        },
    )
    return user["id"]


def set_password(user_id: str, password: str) -> None:
    _send("PUT", f"users/{user_id}", {"password": password})


def delete_user(user_id: str) -> None:
    """Removes a user (and, through the cascade, its new profile). Used only to undo an
    account whose username or phone turned out to be taken a moment after it was made."""
    _send("DELETE", f"users/{user_id}")
