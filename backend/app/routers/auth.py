from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.schemas import LoginRequest, LoginResponse, UserOut
from app.stub_data import STUB_PASSWORD, STUB_USERS

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    email = body.email.lower()
    for user in STUB_USERS:
        if user["email"] == email and body.password == STUB_PASSWORD:
            return {
                "access_token": f"stub-token-{user['id']}",
                "token_type": "bearer",
                "user": user,
            }
    raise HTTPException(status_code=401, detail="Invalid email or password")


@router.get("/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user)):
    return current_user
