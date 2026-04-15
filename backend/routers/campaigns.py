from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Campaign, CampaignStep, Lead, LeadDripState, CampaignEvent,
    INDUSTRY_SEGMENTS, LEAD_STATUSES,
)

router = APIRouter()


class CampaignStepIn(BaseModel):
    step_order: int
    channel: str
    template_id: Optional[int] = None
    delay_days: int = 0
    delay_hours: int = 0
    condition_json: Optional[dict] = None


class CampaignStepOut(CampaignStepIn):
    id: int

    class Config:
        from_attributes = True


class CampaignIn(BaseModel):
    name: str
    description: Optional[str] = None
    segment_filter: str = "all"
    status_filter: Optional[str] = None
    status: str = "draft"
    created_by: Optional[str] = None


class CampaignOut(CampaignIn):
    id: int
    steps: List[CampaignStepOut] = []

    class Config:
        from_attributes = True


class CampaignCardOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    segment_filter: str
    status: str
    step_count: int
    enrolled_count: int
    qualified_count: int
    reply_rate: float

    class Config:
        from_attributes = True


class EnrollFilters(BaseModel):
    industry_segment: Optional[str] = None
    status: Optional[str] = None  # "all" or a specific lead status
    country: Optional[str] = None  # "all" or country name
    exclude_already_enrolled: bool = True
    assigned_sc: Optional[str] = None  # SC emp_code to assign
    min_score: Optional[int] = None


class EnrollResult(BaseModel):
    matched: int
    enrolled: int
    skipped_existing: int


@router.get("", response_model=List[CampaignCardOut])
def list_campaigns(db: Session = Depends(get_db)):
    rows = db.query(Campaign).order_by(Campaign.id.desc()).all()
    out: list[CampaignCardOut] = []
    for c in rows:
        step_count = db.query(func.count(CampaignStep.id)).filter(
            CampaignStep.campaign_id == c.id
        ).scalar() or 0
        enrolled_count = db.query(func.count(LeadDripState.id)).filter(
            LeadDripState.campaign_id == c.id
        ).scalar() or 0
        qualified_count = (
            db.query(func.count(Lead.id))
              .join(LeadDripState, LeadDripState.lead_id == Lead.id)
              .filter(LeadDripState.campaign_id == c.id, Lead.status == "qualified")
              .scalar()
            or 0
        )
        sent = db.query(func.count(CampaignEvent.id)).filter(
            CampaignEvent.campaign_id == c.id, CampaignEvent.event_type == "sent"
        ).scalar() or 0
        replied = db.query(func.count(CampaignEvent.id)).filter(
            CampaignEvent.campaign_id == c.id, CampaignEvent.event_type == "replied"
        ).scalar() or 0
        reply_rate = round((replied / sent) * 100, 1) if sent else 0.0
        out.append(CampaignCardOut(
            id=c.id,
            name=c.name,
            description=c.description,
            segment_filter=c.segment_filter,
            status=c.status,
            step_count=step_count,
            enrolled_count=enrolled_count,
            qualified_count=qualified_count,
            reply_rate=reply_rate,
        ))
    return out


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(body: CampaignIn, db: Session = Depends(get_db)):
    c = Campaign(**body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(404, "campaign not found")
    return c


@router.patch("/{campaign_id}", response_model=CampaignOut)
def update_campaign(campaign_id: int, body: CampaignIn, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(404, "campaign not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(404, "campaign not found")
    db.delete(c)
    db.commit()


# ---- steps ----

@router.get("/{campaign_id}/steps", response_model=List[CampaignStepOut])
def list_steps(campaign_id: int, db: Session = Depends(get_db)):
    return (
        db.query(CampaignStep)
          .filter(CampaignStep.campaign_id == campaign_id)
          .order_by(CampaignStep.step_order)
          .all()
    )


@router.post("/{campaign_id}/steps", response_model=CampaignStepOut, status_code=201)
def add_step(campaign_id: int, body: CampaignStepIn, db: Session = Depends(get_db)):
    if not db.query(Campaign).filter(Campaign.id == campaign_id).first():
        raise HTTPException(404, "campaign not found")
    step = CampaignStep(campaign_id=campaign_id, **body.model_dump())
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@router.patch("/{campaign_id}/steps/{step_id}", response_model=CampaignStepOut)
def update_step(campaign_id: int, step_id: int, body: CampaignStepIn, db: Session = Depends(get_db)):
    step = db.query(CampaignStep).filter(
        CampaignStep.id == step_id,
        CampaignStep.campaign_id == campaign_id,
    ).first()
    if not step:
        raise HTTPException(404, "step not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(step, k, v)
    db.commit()
    db.refresh(step)
    return step


@router.delete("/{campaign_id}/steps/{step_id}", status_code=204)
def delete_step(campaign_id: int, step_id: int, db: Session = Depends(get_db)):
    step = db.query(CampaignStep).filter(
        CampaignStep.id == step_id,
        CampaignStep.campaign_id == campaign_id,
    ).first()
    if not step:
        raise HTTPException(404, "step not found")
    db.delete(step)
    db.commit()


# ---- enrollment ----

def _build_enroll_query(db: Session, filters: EnrollFilters):
    q = db.query(Lead)
    if filters.industry_segment and filters.industry_segment != "all":
        if filters.industry_segment not in INDUSTRY_SEGMENTS:
            raise HTTPException(400, f"invalid segment: {filters.industry_segment}")
        q = q.filter(Lead.industry_segment == filters.industry_segment)
    if filters.status and filters.status != "all":
        if filters.status not in LEAD_STATUSES:
            raise HTTPException(400, f"invalid status: {filters.status}")
        q = q.filter(Lead.status == filters.status)
    if filters.country and filters.country.lower() != "all":
        q = q.filter(Lead.country == filters.country)
    if filters.min_score is not None:
        q = q.filter(Lead.score >= filters.min_score)
    return q


@router.post("/{campaign_id}/enroll/preview")
def enroll_preview(campaign_id: int, filters: EnrollFilters, db: Session = Depends(get_db)):
    if not db.query(Campaign).filter(Campaign.id == campaign_id).first():
        raise HTTPException(404, "campaign not found")
    q = _build_enroll_query(db, filters)
    matched = q.with_entities(func.count(Lead.id)).scalar() or 0

    already = 0
    if filters.exclude_already_enrolled:
        already = (
            db.query(func.count(LeadDripState.id))
              .join(Lead, Lead.id == LeadDripState.lead_id)
              .filter(LeadDripState.campaign_id == campaign_id)
              .filter(Lead.id.in_(q.with_entities(Lead.id).subquery().select()))
              .scalar()
            or 0
        )
    return {"matched": matched, "would_enroll": max(matched - already, 0)}


@router.post("/{campaign_id}/enroll", response_model=EnrollResult)
def enroll_leads(campaign_id: int, filters: EnrollFilters, db: Session = Depends(get_db)):
    if not db.query(Campaign).filter(Campaign.id == campaign_id).first():
        raise HTTPException(404, "campaign not found")

    q = _build_enroll_query(db, filters)
    lead_ids = [lid for (lid,) in q.with_entities(Lead.id).all()]
    matched = len(lead_ids)

    existing_ids: set[int] = set()
    if filters.exclude_already_enrolled and lead_ids:
        existing_ids = {
            lid for (lid,) in db.query(LeadDripState.lead_id)
                                .filter(LeadDripState.campaign_id == campaign_id,
                                        LeadDripState.lead_id.in_(lead_ids))
                                .all()
        }

    now = datetime.utcnow()
    enrolled = 0
    for lid in lead_ids:
        if lid in existing_ids:
            continue
        db.add(LeadDripState(
            lead_id=lid,
            campaign_id=campaign_id,
            current_step=0,
            status="active",
            next_run_at=now,
        ))
        enrolled += 1

    if filters.assigned_sc and lead_ids:
        db.query(Lead).filter(Lead.id.in_(lead_ids)).update(
            {Lead.assigned_sc: filters.assigned_sc}, synchronize_session=False
        )

    db.commit()
    return EnrollResult(
        matched=matched,
        enrolled=enrolled,
        skipped_existing=len(existing_ids),
    )
