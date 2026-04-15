from typing import Optional, List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import V2User

router = APIRouter()


class UserOut(BaseModel):
    emp_code: str
    name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("", response_model=List[UserOut])
def list_users(
    role: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(V2User)
    if role:
        q = q.filter(V2User.role == role)
    if active_only:
        q = q.filter(V2User.is_active.is_(True))
    return [
        UserOut(emp_code=u.ecode, name=u.name, role=u.role, is_active=u.is_active)
        for u in q.order_by(V2User.ecode).all()
    ]
