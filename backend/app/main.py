from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import auth, courses, students

app = FastAPI(title="EA API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/health")
def health():
    return {"status": "ok"}
