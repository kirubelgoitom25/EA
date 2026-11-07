"""ETag revalidation for JSON GET responses.

The apps reload the same lists over and over (the course list is the largest), and most
of the time nothing in them changed. Each 200 JSON answer to a GET carries an ETag (a
hash of its exact bytes). A client that sends it back in If-None-Match gets "304 Not
Modified" with no body when the answer would be byte-for-byte the same.

The route still runs in full every time, with the same login and access checks, and the
tag is the hash of what it would have sent this very moment, so a 304 can never stand
for stale or someone else's data. "private, no-cache" keeps shared caches (Render's
edge) from storing these per-user answers and makes browsers ask again every time.
"""
from hashlib import blake2b

from starlette.datastructures import Headers, MutableHeaders

CACHE_CONTROL = "private, no-cache"


def etag_for(body: bytes) -> str:
    # Weak, because a compressed copy of the same JSON is the same answer.
    return 'W/"' + blake2b(body, digest_size=16).hexdigest() + '"'


def _matches(if_none_match: str, tag: str) -> bool:
    if not if_none_match:
        return False
    wanted = tag[2:] if tag.startswith("W/") else tag
    for candidate in if_none_match.split(","):
        candidate = candidate.strip()
        if candidate == "*":
            return True
        if candidate.startswith("W/"):
            candidate = candidate[2:]
        if candidate == wanted:
            return True
    return False


class ETagMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "GET":
            await self.app(scope, receive, send)
            return

        if_none_match = Headers(scope=scope).get("if-none-match", "")
        start = None
        passthrough = False
        chunks = []

        async def capture(message):
            nonlocal start, passthrough
            if message["type"] == "http.response.start":
                content_type = Headers(raw=message.get("headers", [])).get("content-type", "")
                if message["status"] != 200 or not content_type.startswith("application/json"):
                    passthrough = True
                    await send(message)
                else:
                    start = message
                return
            if passthrough or message["type"] != "http.response.body":
                await send(message)
                return

            chunks.append(message.get("body", b""))
            if message.get("more_body", False):
                return

            body = b"".join(chunks)
            tag = etag_for(body)
            if _matches(if_none_match, tag):
                headers = MutableHeaders(raw=[])
                headers["etag"] = tag
                headers["cache-control"] = CACHE_CONTROL
                await send({"type": "http.response.start", "status": 304, "headers": headers.raw})
                await send({"type": "http.response.body", "body": b""})
                return
            headers = MutableHeaders(raw=list(start["headers"]))
            headers["etag"] = tag
            headers["cache-control"] = CACHE_CONTROL
            await send({**start, "headers": headers.raw})
            await send({"type": "http.response.body", "body": body})

        await self.app(scope, receive, capture)
