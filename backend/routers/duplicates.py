from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Lead, CampaignEvent, V2User
from auth_deps import get_current_user, require_admin
from services.audit import log_action

router = APIRouter()


# ---------- schemas ----------

class MergeRequest(BaseModel):
    keep_id: int
    merge_ids: List[int]


# ---------- GET /duplicates/stats ----------

@router.get("/stats")
def duplicate_stats(
    db: Session = Depends(get_db),
    _user: V2User = Depends(get_current_user),
):
    total_leads = db.query(func.count(Lead.id)).scalar() or 0
    unique_companies = (
        db.query(func.count(func.distinct(func.lower(Lead.company_name)))).scalar() or 0
    )

    # duplicate groups: company names appearing more than once
    sub = (
        db.query(
            func.lower(Lead.company_name).label("cname"),
            func.count(Lead.id).label("cnt"),
        )
        .group_by(func.lower(Lead.company_name))
        .having(func.count(Lead.id) > 1)
        .subquery()
    )
    duplicate_companies = db.query(func.count()).select_from(sub).scalar() or 0
    duplicate_leads = (
        db.query(func.coalesce(func.sum(sub.c.cnt - 1), 0)).scalar() or 0
    )

    return {
        "total_leads": int(total_leads),
        "unique_companies": int(unique_companies),
        "duplicate_companies": int(duplicate_companies),
        "duplicate_leads": int(duplicate_leads),
    }


# ---------- GET /duplicates/scan ----------

@router.get("/scan")
def scan_duplicates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    mode: str = Query("company", pattern="^(company|domain)$"),
    db: Session = Depends(get_db),
    _user: V2User = Depends(require_admin),
):
    if mode == "domain":
        return _scan_by_domain(db, page, page_size)
    return _scan_by_company(db, page, page_size)


def _scan_by_company(db: Session, page: int, page_size: int):
    # Find company names with duplicates
    dup_q = (
        db.query(
            func.lower(Lead.company_name).label("cname"),
            func.count(Lead.id).label("cnt"),
        )
        .group_by(func.lower(Lead.company_name))
        .having(func.count(Lead.id) > 1)
        .order_by(func.count(Lead.id).desc())
    )

    total_groups = dup_q.count()
    offset = (page - 1) * page_size
    dup_rows = dup_q.offset(offset).limit(page_size).all()

    groups = []
    for row in dup_rows:
        cname = row.cname
        leads = (
            db.query(Lead)
            .filter(func.lower(Lead.company_name) == cname)
            .order_by(Lead.score.desc(), Lead.created_at.asc())
            .all()
        )
        groups.append({
            "company_name": leads[0].company_name if leads else cname,
            "count": int(row.cnt),
            "leads": [
                {
                    "id": l.id,
                    "contact_name": l.contact_name,
                    "email": l.email,
                    "phone": l.phone,
                    "status": l.status,
                    "score": l.score,
                    "created_at": l.created_at.isoformat() if l.created_at else None,
                }
                for l in leads
            ],
        })

    return {
        "total_groups": total_groups,
        "groups": groups,
        "page": page,
        "page_size": page_size,
    }


def _scan_by_domain(db: Session, page: int, page_size: int):
    # Extract email domain and group
    domain_expr = func.substring_index(Lead.email, "@", -1)
    dup_q = (
        db.query(
            domain_expr.label("domain"),
            func.count(Lead.id).label("cnt"),
        )
        .filter(Lead.email.isnot(None), Lead.email != "")
        .group_by(domain_expr)
        .having(func.count(Lead.id) > 1)
        .order_by(func.count(Lead.id).desc())
    )

    total_groups = dup_q.count()
    offset = (page - 1) * page_size
    dup_rows = dup_q.offset(offset).limit(page_size).all()

    groups = []
    for row in dup_rows:
        domain = row.domain
        leads = (
            db.query(Lead)
            .filter(func.substring_index(Lead.email, "@", -1) == domain)
            .order_by(Lead.score.desc(), Lead.created_at.asc())
            .all()
        )
        groups.append({
            "company_name": f"@{domain}",
            "count": int(row.cnt),
            "leads": [
                {
                    "id": l.id,
                    "contact_name": l.contact_name,
                    "email": l.email,
                    "phone": l.phone,
                    "status": l.status,
                    "score": l.score,
                    "created_at": l.created_at.isoformat() if l.created_at else None,
                }
                for l in leads
            ],
        })

    return {
        "total_groups": total_groups,
        "groups": groups,
        "page": page,
        "page_size": page_size,
    }


# ---------- POST /duplicates/merge ----------

MERGE_FIELDS = [
    "contact_name", "designation", "email", "phone", "alt_phone",
    "website", "linkedin_url", "address_line1", "address_line2",
    "city", "state", "pincode", "country", "sub_segment",
    "annual_revenue", "employee_count", "source_detail", "notes",
]


@router.post("/merge")
def merge_duplicates(
    body: MergeRequest,
    db: Session = Depends(get_db),
    _user: V2User = Depends(require_admin),
):
    keep = db.query(Lead).filter(Lead.id == body.keep_id).first()
    if not keep:
        raise HTTPException(status_code=404, detail="Keep lead not found")

    merges = db.query(Lead).filter(Lead.id.in_(body.merge_ids)).all()
    if len(merges) != len(body.merge_ids):
        found = {m.id for m in merges}
        missing = [mid for mid in body.merge_ids if mid not in found]
        raise HTTPException(status_code=404, detail=f"Merge leads not found: {missing}")

    if body.keep_id in body.merge_ids:
        raise HTTPException(status_code=400, detail="keep_id cannot be in merge_ids")

    # Copy non-null fields from merged leads into keep lead where keep is null
    for merge_lead in merges:
        for field in MERGE_FIELDS:
            if getattr(keep, field) is None and getattr(merge_lead, field) is not None:
                setattr(keep, field, getattr(merge_lead, field))

    # Keep highest score
    max_score = max(m.score or 0 for m in merges)
    if max_score > (keep.score or 0):
        keep.score = max_score

    # Transfer campaign events
    merge_id_list = [m.id for m in merges]
    db.query(CampaignEvent).filter(
        CampaignEvent.lead_id.in_(merge_id_list)
    ).update({CampaignEvent.lead_id: keep.id}, synchronize_session="fetch")

    # Delete merged leads (cascade will handle drip_states)
    deleted_ids = []
    for m in merges:
        deleted_ids.append(m.id)
        db.delete(m)

    log_action(db, _user, "merge", "lead", keep.id, details={"kept": keep.id, "deleted_ids": deleted_ids})
    db.commit()

    return {
        "kept": keep.id,
        "merged": len(deleted_ids),
        "deleted_ids": deleted_ids,
    }
