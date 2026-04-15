from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Notification

router = APIRouter()


class NotificationOut(BaseModel):
    id: int
    user_emp_code: str
    type: str
    title: str
    body: Optional[str] = None
    lead_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    emp_code: Optional[str] = None,
    unread_only: bool = False,
    limit: int = Query(20, ge=1, le=100),
):
    q = db.query(Notification)
    if emp_code:
        q = q.filter(Notification.user_emp_code == emp_code)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return q.order_by(Notification.created_at.desc()).limit(limit).all()


@router.get("/unread-count")
def unread_count(emp_code: str, db: Session = Depends(get_db)):
    n = db.query(Notification).filter(
        Notification.user_emp_code == emp_code,
        Notification.is_read == False,
    ).count()
    return {"count": n}


@router.post("/mark-read/{notif_id}")
def mark_read(notif_id: int, db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notif_id).first()
    if not n:
        raise HTTPException(404, "notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/mark-all-read")
def mark_all_read(emp_code: str, db: Session = Depends(get_db)):
    updated = db.query(Notification).filter(
        Notification.user_emp_code == emp_code,
        Notification.is_read == False,
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"updated": updated}
