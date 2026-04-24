from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import CampaignEvent, Lead, Notification, V2User
from auth_deps import get_current_user

router = APIRouter()

EVENT_TYPES = {
    "sent", "delivered", "opened", "clicked", "replied",
    "bounced", "unsubscribed", "failed",
    "call_made", "call_answered", "note",
}
CHANNELS = {"email", "sms", "whatsapp", "call", "task", "system"}

# Default score delta per event type (overridable via EventIn.score_delta)
DEFAULT_SCORE_DELTAS = {
    "sent":          1,
    "delivered":     1,
    "opened":        5,
    "clicked":       10,
    "replied":       30,
    "call_answered": 25,
    "call_made":     2,
    "bounced":      -20,
    "unsubscribed": -50,
    "failed":       -2,
    "note":          0,
}
SCORE_MIN, SCORE_MAX = 0, 100


def _clamp_score(v: int) -> int:
    return max(SCORE_MIN, min(SCORE_MAX, v))


class EventIn(BaseModel):
    lead_id: int
    campaign_id: Optional[int] = None
    step_id: Optional[int] = None
    event_type: str
    channel: str = "system"
    payload: Optional[dict] = None
    score_delta: Optional[int] = None
    notes: Optional[str] = None


class EventOut(EventIn):
    id: int
    occurred_at: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=EventOut, status_code=201)
def log_event(body: EventIn, db: Session = Depends(get_db), _user: V2User = Depends(get_current_user)):
    if body.event_type not in EVENT_TYPES:
        raise HTTPException(400, f"invalid event_type: {body.event_type}")
    if body.channel not in CHANNELS:
        raise HTTPException(400, f"invalid channel: {body.channel}")
    lead = db.query(Lead).filter(Lead.id == body.lead_id).first()
    if not lead:
        raise HTTPException(404, "lead not found")

    payload = body.payload or {}
    if body.notes:
        payload = {**payload, "notes": body.notes}

    ev = CampaignEvent(
        lead_id=body.lead_id,
        campaign_id=body.campaign_id,
        step_id=body.step_id,
        event_type=body.event_type,
        channel=body.channel,
        payload=payload or None,
    )
    db.add(ev)

    delta = body.score_delta if body.score_delta is not None else DEFAULT_SCORE_DELTAS.get(body.event_type, 0)
    prev_score = lead.score or 0
    if delta:
        lead.score = _clamp_score(prev_score + delta)
    new_score = lead.score or 0

    if body.event_type == "bounced":
        lead.bounce_flag = True
    if body.event_type == "unsubscribed":
        lead.unsubscribed = True

    if body.event_type == "replied" and lead.assigned_sc:
        db.add(Notification(
            user_emp_code=lead.assigned_sc,
            type="reply_received",
            title=f"Reply from {lead.company_name}",
            body=(body.notes or "Lead replied to a campaign message")[:255],
            lead_id=lead.id,
        ))

    if prev_score < 70 and new_score >= 70 and lead.assigned_sc:
        db.add(Notification(
            user_emp_code=lead.assigned_sc,
            type="lead_qualified",
            title=f"{lead.company_name} qualified",
            body=f"Score reached {new_score} (was {prev_score})",
            lead_id=lead.id,
        ))

    db.commit()
    db.refresh(ev)
    return ev


@router.get("", response_model=List[EventOut])
def list_events(
    db: Session = Depends(get_db),
    _user: V2User = Depends(get_current_user),
    lead_id: Optional[int] = None,
    campaign_id: Optional[int] = None,
    event_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
):
    q = db.query(CampaignEvent)
    if lead_id:
        q = q.filter(CampaignEvent.lead_id == lead_id)
    if campaign_id:
        q = q.filter(CampaignEvent.campaign_id == campaign_id)
    if event_type:
        q = q.filter(CampaignEvent.event_type == event_type)
    return q.order_by(CampaignEvent.occurred_at.desc()).limit(limit).all()
