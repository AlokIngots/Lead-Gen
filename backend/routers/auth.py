import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import V2User
from auth_deps import create_access_token, create_refresh_token, rotate_refresh_token, get_current_user
from services.rate_limit import RateLimiter
from services.otp_service import (
    generate_otp,
    generate_session_id,
    send_message,
    store_otp_session,
    verify_otp_session,
    cleanup_expired_sessions,
)

router = APIRouter()

_login_limiter = RateLimiter(
    max_attempts=int(os.getenv("OTP_MAX_ATTEMPTS", "5")),
    window_seconds=int(os.getenv("OTP_WINDOW_SECONDS", "300")),
)

_verify_limiter = RateLimiter(
    max_attempts=int(os.getenv("OTP_VERIFY_MAX_ATTEMPTS", "5")),
    window_seconds=int(os.getenv("OTP_VERIFY_WINDOW_SECONDS", "300")),
)

DEV_RETURN_OTP = os.getenv("DEV_RETURN_OTP", "false").strip().lower() == "true"


class LoginRequest(BaseModel):
    emp_code: str = Field(..., min_length=1, max_length=32)


class VerifyOtpRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    otp: str = Field(..., min_length=6, max_length=6)


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    cleanup_expired_sessions(db)

    client_ip = request.client.host if request.client else "unknown"
    key = f"login:{payload.emp_code}:{client_ip}"
    if not _login_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Try later.")

    user = db.query(V2User).filter(V2User.ecode == payload.emp_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    if not user.phone:
        raise HTTPException(status_code=400, detail="No phone number on file for this user")

    otp = generate_otp()
    session_id = generate_session_id()

    try:
        send_message(user.phone, otp, user.country_code)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to send OTP")

    store_otp_session(db, session_id, user.ecode, otp, user.phone)

    last4 = user.phone[-4:] if len(user.phone) >= 4 else user.phone
    resp = {
        "message": f"OTP sent to ******{last4}",
        "session_id": session_id,
    }
    if DEV_RETURN_OTP:
        resp["otp"] = otp
    return resp


@router.post("/verify-otp")
async def verify_otp(
    payload: VerifyOtpRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    key = f"verify:{payload.session_id}:{client_ip}"
    if not _verify_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many OTP verification attempts. Try later.")

    ecode = verify_otp_session(db, payload.session_id, payload.otp)
    if not ecode:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user = db.query(V2User).filter(V2User.ecode == ecode).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = create_access_token(user.ecode)
    refresh_token = create_refresh_token(db, user.ecode)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "emp_code": user.ecode,
            "name": user.name,
            "role": user.role,
        },
    }


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


@router.post("/refresh")
async def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access + refresh token pair."""
    new_access, new_refresh, ecode = rotate_refresh_token(db, payload.refresh_token)
    user = db.query(V2User).filter(V2User.ecode == ecode).first()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")
    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
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
