from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from database import get_db
from models import Lead, INDUSTRY_SEGMENTS, LEAD_STATUSES

router = APIRouter()


class LeadOut(BaseModel):
    id: int
    company_name: str
    contact_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    industry_segment: str
    status: str
    score: int
    assigned_sc: Optional[str] = None
    source: str
    dnc_flag: bool
    bounce_flag: bool

    class Config:
        from_attributes = True


class LeadListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[LeadOut]


class LeadPatch(BaseModel):
    contact_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    industry_segment: Optional[str] = None
    score: Optional[int] = Field(None, ge=0, le=100)
    assigned_sc: Optional[str] = None
    dnc_flag: Optional[bool] = None
    bounce_flag: Optional[bool] = None
    notes: Optional[str] = None


@router.get("", response_model=LeadListResponse)
def list_leads(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="search on company/contact/email/phone"),
    status: Optional[str] = None,
    industry_segment: Optional[str] = None,
    assigned_sc: Optional[str] = None,
    source: Optional[str] = None,
    min_score: Optional[int] = Query(None, ge=0, le=100),
    dnc: Optional[bool] = None,
    bounce: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    query = db.query(Lead)

    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Lead.company_name.like(like),
            Lead.contact_name.like(like),
            Lead.email.like(like),
            Lead.phone.like(like),
        ))
    if status:
        if status not in LEAD_STATUSES:
            raise HTTPException(400, f"invalid status: {status}")
        query = query.filter(Lead.status == status)
    if industry_segment:
        if industry_segment not in INDUSTRY_SEGMENTS:
            raise HTTPException(400, f"invalid segment: {industry_segment}")
        query = query.filter(Lead.industry_segment == industry_segment)
    if assigned_sc:
        query = query.filter(Lead.assigned_sc == assigned_sc)
    if source:
        query = query.filter(Lead.source == source)
    if min_score is not None:
        query = query.filter(Lead.score >= min_score)
    if dnc is not None:
        query = query.filter(Lead.dnc_flag == dnc)
    if bounce is not None:
        query = query.filter(Lead.bounce_flag == bounce)

    total = query.with_entities(func.count(Lead.id)).scalar() or 0
    items = (
        query.order_by(Lead.id.desc())
             .offset((page - 1) * page_size)
             .limit(page_size)
             .all()
    )
    return LeadListResponse(total=total, page=page, page_size=page_size, items=items)


class LeadBulkPatch(BaseModel):
    ids: List[int] = Field(..., min_length=1)
    status: Optional[str] = None
    assigned_sc: Optional[str] = None
    industry_segment: Optional[str] = None
    dnc_flag: Optional[bool] = None
    bounce_flag: Optional[bool] = None


@router.patch("/bulk")
def bulk_update_leads(patch: LeadBulkPatch, db: Session = Depends(get_db)):
    data = patch.model_dump(exclude_unset=True, exclude={'ids'})
    if not data:
        raise HTTPException(400, "no fields to update")
    if "status" in data and data["status"] not in LEAD_STATUSES:
        raise HTTPException(400, f"invalid status: {data['status']}")
    if "industry_segment" in data and data["industry_segment"] not in INDUSTRY_SEGMENTS:
        raise HTTPException(400, f"invalid segment: {data['industry_segment']}")
    updated = (
        db.query(Lead)
          .filter(Lead.id.in_(patch.ids))
          .update(data, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "lead not found")
    return lead


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: int, patch: LeadPatch, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "lead not found")

    data = patch.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in LEAD_STATUSES:
        raise HTTPException(400, f"invalid status: {data['status']}")
    if "industry_segment" in data and data["industry_segment"] not in INDUSTRY_SEGMENTS:
        raise HTTPException(400, f"invalid segment: {data['industry_segment']}")

    for k, v in data.items():
        setattr(lead, k, v)

    db.commit()
    db.refresh(lead)
    return lead
