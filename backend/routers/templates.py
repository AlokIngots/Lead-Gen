from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Template, V2User
from auth_deps import get_current_user, require_admin

router = APIRouter()

ALLOWED_CHANNELS = {"email", "sms", "whatsapp", "call_script", "linkedin"}


class TemplateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    channel: str
    subject: Optional[str] = None
    body: str
    variables: Optional[dict] = None
    segment: Optional[str] = None
    active: bool = True


class TemplateOut(BaseModel):
    id: int
    name: str
    channel: str
    subject: Optional[str] = None
    body: str
    variables: Optional[dict] = None
    segment: Optional[str] = None
    active: bool

    class Config:
        from_attributes = True


def _validate_channel(ch: str) -> None:
    if ch not in ALLOWED_CHANNELS:
        raise HTTPException(400, f"invalid channel: {ch}")


@router.get("", response_model=List[TemplateOut])
def list_templates(
    channel: Optional[str] = None,
    db: Session = Depends(get_db),
    _user: V2User = Depends(get_current_user),
):
    q = db.query(Template)
    if channel:
        _validate_channel(channel)
        q = q.filter(Template.channel == channel)
    return [_serialize(t) for t in q.order_by(Template.id.desc()).all()]


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateIn, db: Session = Depends(get_db), _user: V2User = Depends(require_admin)):
    _validate_channel(body.channel)
    data = body.model_dump()
    segment = data.pop("segment", None)
    variables = data.get("variables") or {}
    if segment:
        variables = {**variables, "segment": segment}
    data["variables"] = variables or None
    t = Template(**data)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _serialize(t)


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db), _user: V2User = Depends(get_current_user)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(404, "template not found")
    return _serialize(t)


@router.patch("/{template_id}", response_model=TemplateOut)
def update_template(template_id: int, body: TemplateIn, db: Session = Depends(get_db), _user: V2User = Depends(require_admin)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(404, "template not found")
    _validate_channel(body.channel)
    data = body.model_dump(exclude_unset=True)
    segment = data.pop("segment", None)
    if segment is not None:
        existing_vars = t.variables or {}
        data["variables"] = {**existing_vars, "segment": segment}
    for k, v in data.items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return _serialize(t)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db), _user: V2User = Depends(require_admin)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(404, "template not found")
    db.delete(t)
    db.commit()


def _serialize(t: Template) -> TemplateOut:
    segment = (t.variables or {}).get("segment") if isinstance(t.variables, dict) else None
    return TemplateOut(
        id=t.id,
        name=t.name,
        channel=t.channel,
        subject=t.subject,
        body=t.body,
        variables=t.variables,
        segment=segment,
        active=t.active,
    )
