from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response

from app.routers import admin, auth, classes, courses, payments, practice, presence, quiz, stats, students, studio, teacher_content
from fastapi import Depends, FastAPI, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.http_cache import ETagMiddleware
from app.payment_rules import MAX_PROOF_BYTES

import os

IS_PROD = os.getenv("ENVIRONMENT") == "production"
app = FastAPI(
    title="EA API",
    version="0.1.0",
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None,
    openapi_url=None if IS_PROD else "/openapi.json",
)

# Middleware added first runs innermost. ETag goes inside CORS so a 304 still carries the
# CORS headers, and gzip goes outermost so it compresses the final bytes.
app.add_middleware(ETagMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        *[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# The file limit, plus room for the multipart wrapping.
MAX_UPLOAD_REQUEST_BYTES = MAX_PROOF_BYTES + 64 * 1024
TOO_LARGE = "That image is too large (at most 5 MB)"


class LimitUploadSize:
    """A form is read in full before any route runs, so an oversized upload has to be
    stopped here. Bytes are counted as they arrive, because phones stream uploads with no
    Content-Length, and a stated length can be a lie anyway."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        is_upload = (
            scope["type"] == "http"
            and scope["method"] == "POST"
            and scope["path"].endswith("/payment-requests")
        )
        if not is_upload:
            await self.inner(scope, receive, send)
            return

        stated = dict(scope["headers"]).get(b"content-length", b"")
        if stated.isdigit() and int(stated) > MAX_UPLOAD_REQUEST_BYTES:
            await JSONResponse(status_code=413, content={"detail": TOO_LARGE})(scope, receive, send)
            return

        received = 0

        async def counted():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_UPLOAD_REQUEST_BYTES:
                    raise HTTPException(status_code=413, detail=TOO_LARGE)
            return message

        await self.inner(scope, counted, send)


app.add_middleware(LimitUploadSize)

# JSON compresses about 5x. Small answers and images (already compressed) are left as they are.
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0]
    field = ".".join(
        str(part) for part in first["loc"] if isinstance(part, str) and part != "body"
    )
    detail = f"Invalid or missing field: {field}" if field else "Invalid request"
    return JSONResponse(status_code=422, content={"detail": detail})


app.include_router(auth.router)
app.include_router(students.router)
app.include_router(courses.router)
app.include_router(quiz.router)
app.include_router(practice.router)
app.include_router(stats.router)
app.include_router(classes.router)
app.include_router(presence.router)
app.include_router(teacher_content.router)
app.include_router(studio.teacher_router)
app.include_router(studio.student_router)
app.include_router(payments.student_router)
app.include_router(payments.teacher_router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}

@app.head("/health", include_in_schema=False)
def health_head():
    return Response(status_code=200)


@app.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    db.execute(text("select 1"))
    return {"status": "ok"}
