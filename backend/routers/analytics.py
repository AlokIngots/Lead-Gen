from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Lead, LEAD_STATUSES, INDUSTRY_SEGMENTS,
    Campaign, LeadDripState, CampaignEvent, V2User,
)

router = APIRouter()


@router.get("/funnel")
def funnel(db: Session = Depends(get_db)):
    rows = (
        db.query(Lead.status, func.count(Lead.id))
          .group_by(Lead.status)
          .all()
    )
    counts = {status: 0 for status in LEAD_STATUSES}
    for status, n in rows:
        counts[status] = int(n)
    total = sum(counts.values())
    return {
        "total": total,
        "stages": [{"status": s, "count": counts[s]} for s in LEAD_STATUSES],
    }


@router.get("/segments")
def segments(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Lead.industry_segment,
            func.count(Lead.id).label("total"),
            func.sum(func.if_(Lead.status == "won", 1, 0)).label("won"),
            func.sum(func.if_(Lead.status == "qualified", 1, 0)).label("qualified"),
            func.avg(Lead.score).label("avg_score"),
        )
        .group_by(Lead.industry_segment)
        .all()
    )
    return [
        {
            "segment": r[0],
            "total": int(r[1] or 0),
            "won": int(r[2] or 0),
            "qualified": int(r[3] or 0),
            "avg_score": float(r[4] or 0),
        }
        for r in rows
    ]


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    # Section 1 — top stats
    status_counts = dict(
        db.query(Lead.status, func.count(Lead.id)).group_by(Lead.status).all()
    )
    total_leads = sum(int(v) for v in status_counts.values())
    in_drip = (
        db.query(func.count(func.distinct(LeadDripState.lead_id)))
          .filter(LeadDripState.status == "active")
          .scalar() or 0
    )
    stats = {
        "total_leads":     total_leads,
        "in_drip":         int(in_drip),
        "emailed":         int(status_counts.get("emailed", 0)),
        "engaged":         int(status_counts.get("engaged", 0)),
        "qualified":       int(status_counts.get("qualified", 0)),
        "transferred":     int(status_counts.get("transferred", 0)),
    }

    # Section 2 — funnel (raw → emailed → engaged → qualified → transferred)
    funnel_stages = ["raw", "emailed", "engaged", "qualified", "transferred"]
    funnel = []
    for stage in funnel_stages:
        count = int(status_counts.get(stage, 0))
        pct = round((count / total_leads) * 100, 1) if total_leads else 0.0
        funnel.append({"status": stage, "count": count, "percent": pct})

    # Section 3a — reply rate by segment
    seg_totals = dict(
        db.query(Lead.industry_segment, func.count(Lead.id))
          .group_by(Lead.industry_segment).all()
    )
    seg_replied = dict(
        db.query(Lead.industry_segment, func.count(func.distinct(CampaignEvent.lead_id)))
          .join(CampaignEvent, CampaignEvent.lead_id == Lead.id)
          .filter(CampaignEvent.event_type == "replied")
          .group_by(Lead.industry_segment).all()
    )
    seg_sent = dict(
        db.query(Lead.industry_segment, func.count(func.distinct(CampaignEvent.lead_id)))
          .join(CampaignEvent, CampaignEvent.lead_id == Lead.id)
          .filter(CampaignEvent.event_type == "sent")
          .group_by(Lead.industry_segment).all()
    )
    segments_out = []
    for seg in INDUSTRY_SEGMENTS:
        total = int(seg_totals.get(seg, 0))
        sent = int(seg_sent.get(seg, 0))
        replied = int(seg_replied.get(seg, 0))
        rate = round((replied / sent) * 100, 1) if sent else 0.0
        segments_out.append({
            "segment": seg, "total": total, "sent": sent,
            "replied": replied, "reply_rate": rate,
        })

    # Section 3b — active campaigns
    campaigns_q = (
        db.query(Campaign)
          .filter(Campaign.status.in_(["active", "paused"]))
          .order_by(Campaign.id.desc())
          .all()
    )
    active_campaigns = []
    for c in campaigns_q:
        enrolled = db.query(func.count(LeadDripState.id)).filter(
            LeadDripState.campaign_id == c.id
        ).scalar() or 0
        sent = db.query(func.count(CampaignEvent.id)).filter(
            CampaignEvent.campaign_id == c.id, CampaignEvent.event_type == "sent"
        ).scalar() or 0
        replied = db.query(func.count(CampaignEvent.id)).filter(
            CampaignEvent.campaign_id == c.id, CampaignEvent.event_type == "replied"
        ).scalar() or 0
        active_campaigns.append({
            "id": c.id, "name": c.name, "segment": c.segment_filter,
            "status": c.status, "enrolled": int(enrolled),
            "reply_rate": round((replied / sent) * 100, 1) if sent else 0.0,
        })

    # Section 4 — SC performance
    scs = db.query(V2User).filter(V2User.role == "sc", V2User.is_active.is_(True)).all()
    sc_rows_q = dict(
        db.query(Lead.assigned_sc, func.count(Lead.id))
          .filter(Lead.assigned_sc.isnot(None))
          .group_by(Lead.assigned_sc).all()
    )
    by_sc_status = (
        db.query(Lead.assigned_sc, Lead.status, func.count(Lead.id))
          .filter(Lead.assigned_sc.isnot(None))
          .group_by(Lead.assigned_sc, Lead.status).all()
    )
    sc_status_map: dict[str, dict[str, int]] = {}
    for sc, st, n in by_sc_status:
        sc_status_map.setdefault(sc, {})[st] = int(n)

    sc_reply_sent = (
        db.query(
            Lead.assigned_sc,
            func.sum(case((CampaignEvent.event_type == "sent", 1), else_=0)),
            func.sum(case((CampaignEvent.event_type == "replied", 1), else_=0)),
        )
        .join(CampaignEvent, CampaignEvent.lead_id == Lead.id)
        .filter(Lead.assigned_sc.isnot(None))
        .group_by(Lead.assigned_sc)
        .all()
    )
    sc_rate_map: dict[str, tuple[int, int]] = {
        sc: (int(s or 0), int(r or 0)) for sc, s, r in sc_reply_sent
    }

    sc_performance = []
    for u in scs:
        st = sc_status_map.get(u.ecode, {})
        sent, replied = sc_rate_map.get(u.ecode, (0, 0))
        rate = round((replied / sent) * 100, 1) if sent else 0.0
        sc_performance.append({
            "emp_code":  u.ecode,
            "name":      u.name,
            "assigned":  int(sc_rows_q.get(u.ecode, 0)),
            "emailed":   int(st.get("emailed", 0)),
            "engaged":   int(st.get("engaged", 0)),
            "qualified": int(st.get("qualified", 0)),
            "reply_rate": rate,
        })
    sc_performance.sort(key=lambda r: (-r["qualified"], -r["assigned"]))

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "stats": stats,
        "funnel": funnel,
        "segments": segments_out,
        "active_campaigns": active_campaigns,
        "sc_performance": sc_performance,
    }


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    total = db.query(func.count(Lead.id)).scalar() or 0
    dnc = db.query(func.count(Lead.id)).filter(Lead.dnc_flag.is_(True)).scalar() or 0
    bounced = db.query(func.count(Lead.id)).filter(Lead.bounce_flag.is_(True)).scalar() or 0
    won = db.query(func.count(Lead.id)).filter(Lead.status == "won").scalar() or 0
    qualified = db.query(func.count(Lead.id)).filter(Lead.status == "qualified").scalar() or 0
    return {
        "total_leads": int(total),
        "qualified": int(qualified),
        "won": int(won),
        "dnc": int(dnc),
        "bounced": int(bounced),
    }
