"""Drip scheduler endpoints used by the n8n drip workflow.

`/drip/due`     — leads whose next touchpoint is due now
`/drip/log`     — record a sent/delivered/opened/etc. event from n8n
`/drip/advance` — move a lead to the next step in its drip sequence
`/drip/webhook/reply` — fallback reply webhook (mirrors the n8n SES workflow)
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Lead, LeadDripState, Campaign, CampaignStep, CampaignEvent, Template, V2User,
)
from routers.events import (
    DEFAULT_SCORE_DELTAS, EVENT_TYPES, CHANNELS, _clamp_score,
)

router = APIRouter()


# ----------------------------- schemas -----------------------------

class DripDueItem(BaseModel):
    drip_state_id: int
    lead_id: int
    campaign_id: int
    campaign_step_id: int
    step_order: int
    channel: str
    delay_days: int

    email: Optional[str] = None
    company: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    score: int
    industry_segment: str

    template_subject: Optional[str] = None
    template_body: Optional[str] = None

    assigned_sc: Optional[str] = None
    assigned_sc_name: Optional[str] = None
    assigned_sc_phone: Optional[str] = None
    assigned_sc_country_code: Optional[str] = None


class DripLogIn(BaseModel):
    lead_id: int
    channel: str
    event_type: str
    step_id: Optional[int] = None
    campaign_id: Optional[int] = None
    score_delta: Optional[int] = None
    payload: Optional[dict] = None
    notes: Optional[str] = None


class DripAdvanceIn(BaseModel):
    lead_id: int
    campaign_id: int


class DripAdvanceOut(BaseModel):
    lead_id: int
    campaign_id: int
    new_step: Optional[int]
    next_run_at: Optional[datetime]
    completed: bool


class ReplyWebhookIn(BaseModel):
    email: str
    subject: Optional[str] = None
    body: Optional[str] = None


# ----------------------------- helpers -----------------------------

def _resolve_template(step: CampaignStep, db: Session) -> tuple[Optional[str], Optional[str]]:
    """Return (subject, body) preferring step.condition_json, falling back to linked Template."""
    cj = step.condition_json or {}
    subject = cj.get("subject")
    body = cj.get("body")
    if (not subject or not body) and step.template_id:
        tpl = db.query(Template).filter(Template.id == step.template_id).first()
        if tpl:
            subject = subject or tpl.subject
            body = body or tpl.body
    return subject, body


# ----------------------------- endpoints -----------------------------

@router.get("/due", response_model=List[DripDueItem])
def due(limit: int = 200, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    rows = (
        db.query(LeadDripState, Lead, Campaign, CampaignStep)
          .join(Lead, Lead.id == LeadDripState.lead_id)
          .join(Campaign, Campaign.id == LeadDripState.campaign_id)
          .join(
              CampaignStep,
              and_(
                  CampaignStep.campaign_id == LeadDripState.campaign_id,
                  CampaignStep.step_order == LeadDripState.current_step + 1,
              ),
          )
          .filter(LeadDripState.status == "active")
          .filter(LeadDripState.next_run_at.isnot(None))
          .filter(LeadDripState.next_run_at <= now)
          .filter(Campaign.status == "active")
          .filter(Lead.unsubscribed.is_(False))
          .filter(Lead.bounce_flag.is_(False))
          .order_by(LeadDripState.next_run_at.asc())
          .limit(limit)
          .all()
    )

    out: list[DripDueItem] = []
    sc_cache: dict[str, V2User] = {}
    for state, lead, _campaign, step in rows:
        subject, body = _resolve_template(step, db)

        sc = None
        if lead.assigned_sc:
            sc = sc_cache.get(lead.assigned_sc)
            if sc is None:
                sc = db.query(V2User).filter(V2User.ecode == lead.assigned_sc).first()
                if sc:
                    sc_cache[lead.assigned_sc] = sc

        out.append(DripDueItem(
            drip_state_id=state.id,
            lead_id=lead.id,
            campaign_id=state.campaign_id,
            campaign_step_id=step.id,
            step_order=step.step_order,
            channel=step.channel,
            delay_days=step.delay_days,

            email=lead.email,
            company=lead.company_name,
            contact_name=lead.contact_name,
            phone=lead.phone,
            linkedin_url=lead.linkedin_url,
            score=int(lead.score or 0),
            industry_segment=lead.industry_segment,

            template_subject=subject,
            template_body=body,

            assigned_sc=lead.assigned_sc,
            assigned_sc_name=sc.name if sc else None,
            assigned_sc_phone=sc.phone if sc else None,
            assigned_sc_country_code=sc.country_code if sc else None,
        ))
    return out


@router.post("/log", status_code=201)
def log(body: DripLogIn, db: Session = Depends(get_db)):
    if body.event_type not in EVENT_TYPES:
        raise HTTPException(400, f"invalid event_type: {body.event_type}")
    channel = body.channel
    if channel not in CHANNELS:
        raise HTTPException(400, f"invalid channel: {channel}")

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
        channel=channel,
        payload=payload or None,
    )
    db.add(ev)

    delta = body.score_delta if body.score_delta is not None else DEFAULT_SCORE_DELTAS.get(body.event_type, 0)
    if delta:
        lead.score = _clamp_score((lead.score or 0) + delta)

    # promote lead.status when crossing milestones
    if body.event_type == "sent" and lead.status == "raw":
        lead.status = "emailed"
    elif body.event_type == "replied" and lead.status in ("raw", "new", "emailed"):
        lead.status = "engaged"

    db.commit()
    db.refresh(ev)
    return {"id": ev.id, "lead_score": lead.score, "lead_status": lead.status}


@router.post("/advance", response_model=DripAdvanceOut)
def advance(body: DripAdvanceIn, db: Session = Depends(get_db)):
    state = (
        db.query(LeadDripState)
          .filter(LeadDripState.lead_id == body.lead_id,
                  LeadDripState.campaign_id == body.campaign_id)
          .first()
    )
    if not state:
        raise HTTPException(404, "drip state not found")

    state.current_step += 1
    state.last_step_at = datetime.utcnow()
    state.attempts += 1

    next_step = (
        db.query(CampaignStep)
          .filter(CampaignStep.campaign_id == body.campaign_id,
                  CampaignStep.step_order == state.current_step + 1)
          .first()
    )
    if next_step is None:
        state.status = "completed"
        state.next_run_at = None
        db.commit()
        return DripAdvanceOut(
            lead_id=body.lead_id, campaign_id=body.campaign_id,
            new_step=state.current_step, next_run_at=None, completed=True,
        )

    state.next_run_at = datetime.utcnow() + timedelta(
        days=next_step.delay_days, hours=next_step.delay_hours,
    )
    db.commit()
    return DripAdvanceOut(
        lead_id=body.lead_id, campaign_id=body.campaign_id,
        new_step=state.current_step, next_run_at=state.next_run_at, completed=False,
    )


@router.post("/webhook/reply", status_code=200)
def reply_webhook(body: ReplyWebhookIn, db: Session = Depends(get_db)):
    """Fallback for the SES → SNS → n8n flow. Same effect, called directly."""
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(400, "email required")
    lead = db.query(Lead).filter(Lead.email == email).first()
    if not lead:
        return {"matched": False}

    payload = {"source": "ses_reply"}
    if body.subject:
        payload["subject"] = body.subject

    db.add(CampaignEvent(
        lead_id=lead.id,
        event_type="replied",
        channel="email",
        payload=payload,
    ))
    lead.score = _clamp_score((lead.score or 0) + DEFAULT_SCORE_DELTAS["replied"])
    if lead.status in ("raw", "new", "emailed"):
        lead.status = "engaged"
    db.commit()
    return {
        "matched": True,
        "lead_id": lead.id,
        "lead_score": lead.score,
        "assigned_sc": lead.assigned_sc,
    }
