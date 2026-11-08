"""A small in-memory limiter for the public account routes (register, resolve-login).

Three layers, because no single key is both fair and trustworthy:
  * per network (the client address the proxy reports). A school's Wi-Fi is one address
    for a whole class, so this limit is generous. It can be spoofed, which only weakens it;
  * per target (the phone or username asked about), which cannot be spoofed;
  * overall, a ceiling that caps the damage if both are evaded.

Counts live in this process. That is right for one backend instance; with several, each
keeps its own counts, so the real limits multiply by the instance count.
"""
import threading
import time
from collections import deque
from typing import Optional

from fastapi import HTTPException, Request

MAX_KEYS = 50_000

_lock = threading.Lock()
_hits: dict[str, deque] = {}


def _too_many() -> HTTPException:
    return HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes and try again.")


def hit(key: str, limit: int, window_seconds: float, now: Optional[float] = None) -> bool:
    """Counts one attempt for key. False when the key is already at its limit (the attempt
    is then not counted)."""
    now = time.monotonic() if now is None else now
    with _lock:
        bucket = _hits.get(key)
        if bucket is None:
            if len(_hits) >= MAX_KEYS:
                _prune(now, window_seconds)
            bucket = _hits[key] = deque()
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def _prune(now: float, window_seconds: float) -> None:
    for key in [k for k, b in _hits.items() if not b or now - b[-1] >= window_seconds]:
        del _hits[key]
    if len(_hits) >= MAX_KEYS:
        _hits.clear()  # last resort: forget everything rather than grow without bound


def reset() -> None:
    with _lock:
        _hits.clear()


def client_address(request: Request) -> str:
    # The first X-Forwarded-For entry is the address the client came from, as the proxy
    # chain reports it. Using a later entry would put every student behind one proxy
    # address into a single bucket.
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "unknown"


def check(route: str, request: Request, limits: list[tuple[str, int, float]]) -> None:
    """limits: (scope, limit, window_seconds), scope one of "network", "all" or
    "target:<value>". Raises 429 at the first one that is full."""
    for scope, limit, window in limits:
        if scope == "network":
            key = f"{route}|net|{client_address(request)}"
        elif scope == "all":
            key = f"{route}|all"
        else:
            key = f"{route}|{scope}"
        if not hit(key, limit, window):
            raise _too_many()
