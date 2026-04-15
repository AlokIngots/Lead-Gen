import os
import jwt
from fastapi import Depends, Header, HTTPException, Query
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jwt.exceptions import PyJWTError, ExpiredSignatureError, DecodeError

from database import get_db
from models import V2User

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change_me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))
ALLOW_QUERY_TOKEN = os.getenv("ALLOW_QUERY_TOKEN", "false").strip().lower() == "true"


def create_access_token(ecode: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode = {"sub": ecode, "exp": expire}
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


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
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> V2User:
    jwt_token = None
    if token and ALLOW_QUERY_TOKEN:
        jwt_token = token
    elif authorization:
        try:
            scheme, jwt_token = authorization.split(" ", 1)
            if scheme.lower() != "bearer":
                raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid authorization header format")
    else:
        raise HTTPException(status_code=401, detail="Authorization token required")

    ecode = decode_token_to_ecode(jwt_token)
    user = db.query(V2User).filter(V2User.ecode == ecode).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    return user
