from typing import Optional, List, Dict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from database import get_db
from models import Lead, V2User, INDUSTRY_SEGMENTS, LEAD_STATUSES
from auth_deps import get_current_user

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
    linkedin_url: Optional[str] = None
    has_email: bool = False
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


class TaskLeadOut(BaseModel):
    id: int
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str
    industry_segment: str
    score: int
    last_contacted_at: Optional[str] = None
    next_action_at: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class TaskSummary(BaseModel):
    total_assigned: int
    pending_contact: int
    awaiting_reply: int
    engaged: int
    qualified: int


class MyTasksResponse(BaseModel):
    summary: TaskSummary
    urgent: List[TaskLeadOut]
    recent_leads: List[TaskLeadOut]
    high_score: List[TaskLeadOut]
    needs_followup: List[TaskLeadOut]


def _serialize_lead(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "company_name": lead.company_name,
        "contact_name": lead.contact_name,
        "email": lead.email,
        "phone": lead.phone,
        "status": lead.status,
        "industry_segment": lead.industry_segment,
        "score": lead.score,
        "last_contacted_at": lead.last_contacted_at.isoformat() if lead.last_contacted_at else None,
        "next_action_at": lead.next_action_at.isoformat() if lead.next_action_at else None,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
    }


@router.get("/my-tasks", response_model=MyTasksResponse)
def my_tasks(
    db: Session = Depends(get_db),
    current_user: V2User = Depends(get_current_user),
):
    emp_code = current_user.ecode
    base = db.query(Lead).filter(Lead.assigned_sc == emp_code)

    # Summary counts
    total_assigned = base.with_entities(func.count(Lead.id)).scalar() or 0
    pending_contact = (
        base.filter(Lead.status.in_(["raw", "new"]))
            .with_entities(func.count(Lead.id)).scalar() or 0
    )
    awaiting_reply = (
        base.filter(Lead.status == "emailed")
            .with_entities(func.count(Lead.id)).scalar() or 0
    )
    engaged = (
        base.filter(Lead.status == "engaged")
            .with_entities(func.count(Lead.id)).scalar() or 0
    )
    qualified = (
        base.filter(Lead.status == "qualified")
            .with_entities(func.count(Lead.id)).scalar() or 0
    )

    now = datetime.utcnow()

    # Urgent: next_action_at <= now
    urgent = (
        base.filter(Lead.next_action_at <= now)
            .order_by(Lead.next_action_at.asc())
            .limit(10)
            .all()
    )

    # Recent leads: newest assigned
    recent_leads = (
        base.order_by(Lead.created_at.desc())
            .limit(10)
            .all()
    )

    # High score: top by score
    high_score = (
        base.filter(Lead.score > 0)
            .order_by(Lead.score.desc())
            .limit(10)
            .all()
    )

    # Needs follow-up: emailed but last_contacted_at > 3 days ago
    three_days_ago = now - timedelta(days=3)
    needs_followup = (
        base.filter(
            Lead.status == "emailed",
            Lead.last_contacted_at <= three_days_ago,
        )
        .order_by(Lead.last_contacted_at.asc())
        .limit(10)
        .all()
    )

    return MyTasksResponse(
        summary=TaskSummary(
            total_assigned=total_assigned,
            pending_contact=pending_contact,
            awaiting_reply=awaiting_reply,
            engaged=engaged,
            qualified=qualified,
        ),
        urgent=[_serialize_lead(l) for l in urgent],
        recent_leads=[_serialize_lead(l) for l in recent_leads],
        high_score=[_serialize_lead(l) for l in high_score],
        needs_followup=[_serialize_lead(l) for l in needs_followup],
    )


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


# ── Auto-assign leads round-robin to SCs ──

class AutoAssignRequest(BaseModel):
    segment: Optional[str] = None
    status: Optional[str] = None


class AutoAssignResponse(BaseModel):
    total_assigned: int
    distribution: Dict[str, int]


@router.post("/auto-assign", response_model=AutoAssignResponse)
def auto_assign_leads(
    body: AutoAssignRequest = AutoAssignRequest(),
    db: Session = Depends(get_db),
    current_user: V2User = Depends(get_current_user),
):
    # Only admin can auto-assign
    if current_user.role != "admin":
        raise HTTPException(403, "Only admin users can auto-assign leads")

    # Validate filters
    if body.segment and body.segment not in INDUSTRY_SEGMENTS:
        raise HTTPException(400, f"invalid segment: {body.segment}")
    if body.status and body.status not in LEAD_STATUSES:
        raise HTTPException(400, f"invalid status: {body.status}")

    # Fetch active SCs
    scs = (
        db.query(V2User)
          .filter(V2User.role == "sc", V2User.is_active == True)
          .order_by(V2User.ecode)
          .all()
    )
    if not scs:
        raise HTTPException(400, "No active SCs found to assign leads to")

    sc_codes = [sc.ecode for sc in scs]

    # Fetch unassigned lead IDs matching filters
    query = db.query(Lead.id).filter(Lead.assigned_sc.is_(None))
    if body.segment:
        query = query.filter(Lead.industry_segment == body.segment)
    if body.status:
        query = query.filter(Lead.status == body.status)

    lead_ids = [row[0] for row in query.order_by(Lead.id).all()]

    if not lead_ids:
        return AutoAssignResponse(total_assigned=0, distribution={code: 0 for code in sc_codes})

    # Build round-robin assignment mapping
    distribution: Dict[str, int] = {code: 0 for code in sc_codes}
    num_scs = len(sc_codes)

    # Group lead IDs by assigned SC for batch updates
    sc_lead_ids: Dict[str, List[int]] = {code: [] for code in sc_codes}
    for i, lid in enumerate(lead_ids):
        sc_code = sc_codes[i % num_scs]
        sc_lead_ids[sc_code].append(lid)
        distribution[sc_code] += 1

    # Update in batches of 500 per SC
    BATCH_SIZE = 500
    for sc_code, ids in sc_lead_ids.items():
        for offset in range(0, len(ids), BATCH_SIZE):
            batch = ids[offset : offset + BATCH_SIZE]
            db.query(Lead).filter(Lead.id.in_(batch)).update(
                {"assigned_sc": sc_code}, synchronize_session=False
            )

    db.commit()

    total_assigned = sum(distribution.values())
    return AutoAssignResponse(total_assigned=total_assigned, distribution=distribution)
