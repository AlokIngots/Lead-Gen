import bcrypt
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import V2User
from auth_deps import create_access_token, get_current_user
from services.rate_limit import RateLimiter
import os

router = APIRouter()

_login_limiter = RateLimiter(
    max_attempts=int(os.getenv("LOGIN_MAX_ATTEMPTS", "10")),
    window_seconds=int(os.getenv("LOGIN_WINDOW_SECONDS", "300")),
)


class LoginRequest(BaseModel):
    emp_code: str = Field(..., min_length=1, max_length=32)
    password: str = Field(..., min_length=1)


def _verify_password(plain: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    key = f"login:{payload.emp_code}:{client_ip}"
    if not _login_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try later.")

    user = db.query(V2User).filter(V2User.ecode == payload.emp_code).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid employee code or password")
    if not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid employee code or password")

    token = create_access_token(user.ecode)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "emp_code": user.ecode,
            "name": user.name,
            "role": user.role,
        },
    }


@router.get("/me")
async def get_me(current_user: V2User = Depends(get_current_user)):
    return {
        "emp_code": current_user.ecode,
        "name": current_user.name,
        "role": current_user.role,
        "phone": current_user.phone,
        "country_code": current_user.country_code,
    }


@router.get("/roles")
async def get_roles(
    current_user: V2User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    roles = [r[0] for r in db.query(V2User.role).distinct().all() if r[0]]
    roles.sort()
    return {"roles": roles}
