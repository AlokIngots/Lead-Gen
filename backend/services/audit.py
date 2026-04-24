"""Audit logging helper — records who did what to which entity."""
from typing import Optional
from sqlalchemy.orm import Session
from models import AuditLog, V2User


def log_action(
    db: Session,
    user: V2User,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    db.add(AuditLog(
        user_ecode=user.ecode,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=details,
        ip_address=ip_address,
    ))
    # Don't commit here — let the caller commit along with the main transaction
