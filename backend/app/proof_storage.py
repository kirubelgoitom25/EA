"""Payment screenshots live in a private Supabase bucket that has no policies, so only
this backend's service key reaches it. Nothing else in the app talks to storage.

Tests replace these three functions with an in-memory fake.
"""
import logging

import httpx

from app.config import settings

BUCKET = "payment-proofs"
TIMEOUT_SECONDS = 30

log = logging.getLogger("ea.proofs")


class ProofStorageError(Exception):
    """Storage could not do what was asked. Never carries the key or the file."""


def _url(path: str) -> str:
    return f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{path}"


def _headers() -> dict:
    key = settings.supabase_service_role_key
    if not key:
        raise ProofStorageError("SUPABASE_SERVICE_ROLE_KEY is not set")
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _send(method: str, path: str, **kwargs) -> httpx.Response:
    headers = {**_headers(), **kwargs.pop("headers", {})}
    try:
        response = httpx.request(
            method, _url(path), headers=headers, timeout=TIMEOUT_SECONDS, **kwargs
        )
    except httpx.HTTPError as error:
        raise ProofStorageError(type(error).__name__) from None
    if response.status_code >= 300:
        raise ProofStorageError(f"storage answered {response.status_code}")
    return response


def upload(path: str, data: bytes, content_type: str) -> None:
    _send("POST", path, content=data, headers={"Content-Type": content_type, "x-upsert": "false"})


def download(path: str) -> bytes:
    return _send("GET", path).content


def delete(path: str) -> None:
    """Best effort. A file left behind is harmless, so this never fails the request."""
    try:
        _send("DELETE", path)
    except ProofStorageError as error:
        log.warning("could not delete proof %s: %s", path, error)
