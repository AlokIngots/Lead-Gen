import io
import json
from datetime import datetime
from typing import Dict, Any, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import ImportBatch, Lead, V2User, INDUSTRY_SEGMENTS, LEAD_STATUSES
from auth_deps import get_current_user, require_admin
from services.audit import log_action

router = APIRouter()

# Column aliases — left side = normalized, right side = accepted header names in CSV
COLUMN_ALIASES: Dict[str, list] = {
    "company_name":     ["company", "company_name", "organization", "firm"],
    "contact_name":     ["contact", "contact_name", "name", "person"],
    "designation":      ["designation", "title", "role"],
    "email":            ["email", "email_id", "mail"],
    "phone":            ["phone", "mobile", "contact_no"],
    "alt_phone":        ["alt_phone", "phone2", "secondary_phone"],
    "website":          ["website", "url", "site"],
    "city":             ["city"],
    "state":            ["state"],
    "pincode":          ["pincode", "pin", "zip"],
    "country":          ["country"],
    "industry_segment": ["segment", "industry", "industry_segment"],
    "source":           ["source"],
    "assigned_sc":      ["sc", "assigned_sc", "coordinator"],
    "linkedin_url":     ["linkedin", "linkedin_url"],
}


def _normalize_headers(df: pd.DataFrame) -> pd.DataFrame:
    rename = {}
    lowered = {str(c).strip().lower(): c for c in df.columns}
    for target, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in lowered:
                rename[lowered[alias]] = target
                break
    return df.rename(columns=rename)


def _row_to_lead_kwargs(
    row: pd.Series,
    default_source: str = "import",
    default_segment: Optional[str] = None,
    default_status: str = "raw",
) -> Dict[str, Any]:
    def val(key, default=None):
        v = row.get(key)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return default
        return str(v).strip() if not isinstance(v, (int, float)) else v

    seg = (val("industry_segment") or default_segment or "others")
    if isinstance(seg, str):
        seg = seg.lower()
    if seg not in INDUSTRY_SEGMENTS:
        seg = "others"

    return {
        "company_name": val("company_name") or "Unknown",
        "contact_name": val("contact_name"),
        "designation": val("designation"),
        "email": val("email"),
        "phone": val("phone"),
        "alt_phone": val("alt_phone"),
        "website": val("website"),
        "linkedin_url": val("linkedin_url"),
        "city": val("city"),
        "state": val("state"),
        "pincode": val("pincode"),
        "country": val("country") or "India",
        "industry_segment": seg,
        "source": val("source") or default_source,
        "assigned_sc": val("assigned_sc"),
        "status": default_status,
    }


def _is_valid_email(v) -> bool:
    if v is None:
        return False
    if isinstance(v, float) and pd.isna(v):
        return False
    s = str(v).strip()
    return "@" in s and "." in s.split("@")[-1]


@router.post("")
async def import_csv(
    file: UploadFile = File(...),
    source: str = Form("import"),
    default_status: str = Form("raw"),
    default_segment: Optional[str] = Form(None),
    duplicate_handling: str = Form("skip"),
    column_mapping: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    _user: V2User = Depends(require_admin),
):
    if not file.filename:
        raise HTTPException(400, "missing filename")

    if default_status not in LEAD_STATUSES:
        raise HTTPException(400, f"invalid default_status: {default_status}")

    if duplicate_handling not in ("skip", "update"):
        raise HTTPException(400, "duplicate_handling must be 'skip' or 'update'")

    mapping_overrides: Dict[str, str] = {}
    if column_mapping:
        try:
            parsed = json.loads(column_mapping)
            if not isinstance(parsed, dict):
                raise ValueError("column_mapping must be a JSON object")
            mapping_overrides = {str(k): str(v) for k, v in parsed.items() if v}
        except Exception as e:
            raise HTTPException(400, f"invalid column_mapping JSON: {e}")

    content = await file.read()
    try:
        if file.filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"failed to parse file: {e}")

    if mapping_overrides:
        df = df.rename(columns=mapping_overrides)

    df = _normalize_headers(df)

    batch = ImportBatch(
        filename=file.filename,
        total_rows=len(df),
        status="processing",
        started_at=datetime.utcnow(),
        mapping_json=mapping_overrides or None,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    inserted = 0
    duplicates = 0
    bounced = 0
    errors = 0
    error_messages = []

    has_email_col = "email" in df.columns

    for idx, row in df.iterrows():
        try:
            email = row.get("email") if has_email_col else None
            if email is not None and not (isinstance(email, float) and pd.isna(email)):
                if not _is_valid_email(email):
                    bounced += 1
                    continue

            kwargs = _row_to_lead_kwargs(
                row,
                default_source=source,
                default_segment=default_segment,
                default_status=default_status,
            )

            existing = None
            if kwargs.get("email"):
                existing = db.query(Lead).filter(Lead.email == kwargs["email"]).first()

            if existing:
                duplicates += 1
                if duplicate_handling == "update":
                    for k, v in kwargs.items():
                        if v is not None:
                            setattr(existing, k, v)
                    existing.import_batch_id = batch.id
                    db.add(existing)
                    if duplicates % 200 == 0:
                        db.commit()
                continue

            kwargs["import_batch_id"] = batch.id
            db.add(Lead(**kwargs))
            inserted += 1
            if inserted % 500 == 0:
                db.commit()
        except Exception as e:
            errors += 1
            if len(error_messages) < 50:
                error_messages.append(f"row {idx}: {e}")

    db.commit()

    batch.inserted_rows = inserted
    batch.error_rows = errors
    # ImportBatch has skipped_rows + updated_rows but no duplicate_rows / bounced_rows columns.
    # Persist what we can: skipped = duplicates skipped; updated = duplicates updated.
    if duplicate_handling == "update":
        batch.updated_rows = duplicates
    else:
        batch.skipped_rows = duplicates
    batch.status = "completed" if errors == 0 else "completed"
    batch.finished_at = datetime.utcnow()
    if error_messages:
        batch.error_log = "\n".join(error_messages)
    db.commit()
    db.refresh(batch)

    log_action(db, _user, "import", "lead", batch.id, details={
        "filename": file.filename, "inserted": inserted, "duplicates": duplicates, "errors": errors,
    })
    db.commit()

    return {
        "batch_id": batch.id,
        "total_rows": batch.total_rows,
        "inserted_rows": batch.inserted_rows,
        "duplicate_rows": duplicates,
        "bounced_rows": bounced,
        "error_rows": batch.error_rows,
        "status": batch.status,
    }


@router.get("/history")
def import_history(db: Session = Depends(get_db), _user: V2User = Depends(get_current_user)):
    rows = (
        db.query(ImportBatch)
        .order_by(ImportBatch.id.desc())
        .limit(50)
        .all()
    )
    out = []
    for b in rows:
        duplicate_rows = (getattr(b, "skipped_rows", 0) or 0) + (getattr(b, "updated_rows", 0) or 0)
        out.append({
            "id": getattr(b, "id", None),
            "filename": getattr(b, "filename", None),
            "source": getattr(b, "source", None),
            "total_rows": getattr(b, "total_rows", None),
            "inserted_rows": getattr(b, "inserted_rows", None),
            "duplicate_rows": duplicate_rows,
            "bounced_rows": getattr(b, "bounced_rows", None),
            "error_rows": getattr(b, "error_rows", None),
            "status": getattr(b, "status", None),
            "started_at": getattr(b, "started_at", None).isoformat() if getattr(b, "started_at", None) else None,
            "finished_at": getattr(b, "finished_at", None).isoformat() if getattr(b, "finished_at", None) else None,
        })
    return out
