import hashlib
import os
import secrets as _secrets

import jwt
from fastapi import Depends, Header, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jwt.exceptions import PyJWTError, ExpiredSignatureError, DecodeError

from database import get_db
from models import V2User, RefreshToken

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not JWT_SECRET_KEY or len(JWT_SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET_KEY must be set in .env and be at least 32 characters. "
        "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "2"))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "30"))


def create_access_token(ecode: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode = {"sub": ecode, "exp": expire, "iat": datetime.utcnow()}
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_refresh_token(db: Session, ecode: str) -> str:
    """Create a long-lived opaque refresh token, store hash in DB."""
    raw_token = _secrets.token_urlsafe(48)
    expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS)
    db.add(RefreshToken(
        token_hash=_hash_token(raw_token),
        ecode=ecode,
        expires_at=expires,
    ))
    db.commit()
    return raw_token


def rotate_refresh_token(db: Session, old_raw_token: str) -> tuple[str, str, str]:
    """Validate + revoke old refresh token, issue new access + refresh tokens.

    Returns (access_token, new_refresh_token, ecode).
    Raises HTTPException on invalid/expired/revoked token.
    """
    old_hash = _hash_token(old_raw_token)
    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == old_hash).first()
    if not rt:
        raise HTTPException(401, "Invalid refresh token")
    if rt.revoked:
        # Possible token reuse attack — revoke all tokens for this user
        db.query(RefreshToken).filter(RefreshToken.ecode == rt.ecode).update(
            {"revoked": True}, synchronize_session=False
        )
        db.commit()
        raise HTTPException(401, "Refresh token reuse detected — all sessions revoked")
    if datetime.utcnow() > rt.expires_at:
        rt.revoked = True
        db.commit()
        raise HTTPException(401, "Refresh token expired")

    # Revoke old token
    rt.revoked = True

    ecode = rt.ecode
    new_access = create_access_token(ecode)
    new_refresh = create_refresh_token(db, ecode)
    return new_access, new_refresh, ecode


def decode_token_to_ecode(jwt_token: str) -> str:
    try:
        payload = jwt.decode(jwt_token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        ecode = payload.get("sub")
        if not ecode:
            raise HTTPException(status_code=401, detail="Invalid token")
        return ecode
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except DecodeError:
        raise HTTPException(status_code=401, detail="Invalid token format")
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> V2User:
    # Only accept tokens via Authorization header — never query params
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization token required")

    try:
        scheme, jwt_token = authorization.split(" ", 1)
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    ecode = decode_token_to_ecode(jwt_token)
    user = db.query(V2User).filter(V2User.ecode == ecode).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    return user


def require_admin(current_user: V2User = Depends(get_current_user)) -> V2User:
    """Dependency that ensures the current user has admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


def require_role(*allowed_roles: str):
    """Factory that returns a dependency requiring one of the given roles."""
    def _check(current_user: V2User = Depends(get_current_user)) -> V2User:
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(allowed_roles)}")
        return current_user
    return _check
