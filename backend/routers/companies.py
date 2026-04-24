from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, case, literal_column
from sqlalchemy.orm import Session

from database import get_db
from models import Lead, Company, V2User, INDUSTRY_SEGMENTS, LEAD_STATUSES
from auth_deps import get_current_user

router = APIRouter()

# Status priority for "best status" — higher index = better
STATUS_RANK = {s: i for i, s in enumerate(LEAD_STATUSES)}


class CompanyOut(BaseModel):
    company_name: str
    industry_segment: str
    country: Optional[str] = None
    total_contacts: int
    has_email_count: int
    linkedin_only_count: int
    best_email: Optional[str] = None
    website: Optional[str] = None
    assigned_sc: Optional[str] = None
    status: str
    score: int
    created_at: Optional[str] = None


class CompanyListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[CompanyOut]


class SegmentSummary(BaseModel):
    segment: str
    total_companies: int
    has_email: int
    linkedin_only: int


class CompanySummaryResponse(BaseModel):
    total_companies: int
    total_has_email: int
    total_linkedin_only: int
    total_qualified: int
    segments: List[SegmentSummary]


@router.get("", response_model=CompanyListResponse)
def list_companies(
    db: Session = Depends(get_db),
    _user: V2User = Depends(get_current_user),
    q: Optional[str] = Query(None, description="search on company name"),
    industry_segment: Optional[str] = None,
    country: Optional[str] = None,
    has_email: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    if industry_segment and industry_segment not in INDUSTRY_SEGMENTS:
        raise HTTPException(400, f"invalid segment: {industry_segment}")

    # Build the grouped query
    query = db.query(
        Lead.company_name,
        Lead.industry_segment,
        Lead.country,
        func.count(Lead.id).label("total_contacts"),
        func.sum(case((Lead.email.isnot(None), 1), else_=0)).label("has_email_count"),
        func.sum(case((Lead.email.is_(None), 1), else_=0)).label("linkedin_only_count"),
        func.max(Lead.email).label("best_email"),
        func.max(Lead.website).label("website"),
        func.max(Lead.assigned_sc).label("assigned_sc"),
        func.max(Lead.status).label("status"),
        func.max(Lead.score).label("score"),
        func.min(Lead.created_at).label("created_at"),
    ).group_by(
        Lead.company_name, Lead.industry_segment, Lead.country,
    )

    if q:
        query = query.filter(Lead.company_name.like(f"%{q}%"))
    if industry_segment:
        query = query.filter(Lead.industry_segment == industry_segment)
    if country:
        query = query.filter(Lead.country == country)
    if has_email is True:
        query = query.having(func.sum(case((Lead.email.isnot(None), 1), else_=0)) > 0)
    elif has_email is False:
        query = query.having(func.sum(case((Lead.email.isnot(None), 1), else_=0)) == 0)

    # Count total (subquery)
    count_q = query.subquery()
    total = db.query(func.count()).select_from(count_q).scalar() or 0

    # Paginate
    rows = (
        query.order_by(func.count(Lead.id).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for r in rows:
        # Determine best status by ranking
        best_status = r.status or "raw"
        items.append(CompanyOut(
            company_name=r.company_name,
            industry_segment=r.industry_segment,
            country=r.country,
            total_contacts=r.total_contacts,
            has_email_count=r.has_email_count or 0,
            linkedin_only_count=r.linkedin_only_count or 0,
            best_email=r.best_email,
            website=r.website,
            assigned_sc=r.assigned_sc,
            status=best_status,
            score=r.score or 0,
            created_at=r.created_at.isoformat() if r.created_at else None,
        ))

    return CompanyListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/summary", response_model=CompanySummaryResponse)
def companies_summary(db: Session = Depends(get_db), _user: V2User = Depends(get_current_user)):
    # Per-segment stats
    rows = db.query(
        Lead.industry_segment,
        func.count(func.distinct(Lead.company_name)).label("total_companies"),
    ).group_by(Lead.industry_segment).all()

    # Companies with at least one email per segment
    email_rows = db.query(
        Lead.industry_segment,
        func.count(func.distinct(Lead.company_name)).label("has_email"),
    ).filter(Lead.email.isnot(None)).group_by(Lead.industry_segment).all()
    email_map = {r.industry_segment: r.has_email for r in email_rows}

    # Qualified companies
    qualified_count = db.query(
        func.count(func.distinct(Lead.company_name))
    ).filter(Lead.status == "qualified").scalar() or 0

    segments = []
    total_companies = 0
    total_has_email = 0
    total_linkedin_only = 0

    for r in rows:
        seg_total = r.total_companies
        seg_email = email_map.get(r.industry_segment, 0)
        seg_linkedin = seg_total - seg_email
        segments.append(SegmentSummary(
            segment=r.industry_segment,
            total_companies=seg_total,
            has_email=seg_email,
            linkedin_only=seg_linkedin,
        ))
        total_companies += seg_total
        total_has_email += seg_email
        total_linkedin_only += seg_linkedin

    return CompanySummaryResponse(
        total_companies=total_companies,
        total_has_email=total_has_email,
        total_linkedin_only=total_linkedin_only,
        total_qualified=qualified_count,
        segments=segments,
    )


@router.get("/countries")
def list_countries(db: Session = Depends(get_db), _user: V2User = Depends(get_current_user)):
    rows = (
        db.query(Lead.country)
        .filter(Lead.country.isnot(None))
        .distinct()
        .order_by(Lead.country)
        .all()
    )
    return [r[0] for r in rows]
