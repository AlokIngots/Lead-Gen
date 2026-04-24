from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Enum, ForeignKey,
    Integer, JSON, Numeric, SmallInteger, String, Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class V2User(Base):
    __tablename__ = "v2_users"

    ecode = Column(String(32), primary_key=True)
    name = Column(String(128), nullable=False)
    role = Column(String(32), nullable=False)
    phone = Column(String(32), nullable=True)
    country_code = Column(String(8), nullable=True)
    password_hash = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


INDUSTRY_SEGMENTS = (
    "pumps", "valves", "pneumatics", "defense",
    "stockholders", "cnc", "forging", "others",
)

LEAD_STATUSES = (
    "raw", "new", "emailed", "engaged", "contacted", "qualified", "transferred",
    "proposal", "negotiation", "won", "lost", "nurture", "disqualified",
)


class Lead(Base):
    __tablename__ = "leads"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    company_name = Column(String(255), nullable=False)
    contact_name = Column(String(255))
    designation = Column(String(128))
    email = Column(String(255), index=True)
    phone = Column(String(32), index=True)
    alt_phone = Column(String(32))
    website = Column(String(255))
    linkedin_url = Column(String(500))
    has_email = Column(Boolean, nullable=False, default=False)

    address_line1 = Column(String(255))
    address_line2 = Column(String(255))
    city = Column(String(128))
    state = Column(String(128))
    pincode = Column(String(16))
    country = Column(String(64), nullable=False, default="India")

    industry_segment = Column(
        Enum(*INDUSTRY_SEGMENTS, name="industry_segment_enum"),
        nullable=False, default="others", index=True,
    )
    sub_segment = Column(String(128))
    annual_revenue = Column(Numeric(18, 2))
    employee_count = Column(Integer)

    status = Column(
        Enum(*LEAD_STATUSES, name="lead_status_enum"),
        nullable=False, default="new", index=True,
    )

    score = Column(SmallInteger, nullable=False, default=0, index=True)
    assigned_sc = Column(String(64), index=True)
    owner_user_id = Column(BigInteger)

    source = Column(String(64), nullable=False, default="import", index=True)
    source_detail = Column(String(255))

    dnc_flag = Column(Boolean, nullable=False, default=False, index=True)
    bounce_flag = Column(Boolean, nullable=False, default=False, index=True)
    unsubscribed = Column(Boolean, nullable=False, default=False)

    last_contacted_at = Column(DateTime)
    next_action_at = Column(DateTime, index=True)

    import_batch_id = Column(BigInteger, ForeignKey("import_batches.id"), index=True)

    notes = Column(Text)
    tags = Column(JSON)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    events = relationship("CampaignEvent", back_populates="lead", cascade="all, delete-orphan")
    drip_states = relationship("LeadDripState", back_populates="lead", cascade="all, delete-orphan")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    uploaded_by = Column(String(128))
    total_rows = Column(Integer, nullable=False, default=0)
    inserted_rows = Column(Integer, nullable=False, default=0)
    updated_rows = Column(Integer, nullable=False, default=0)
    skipped_rows = Column(Integer, nullable=False, default=0)
    error_rows = Column(Integer, nullable=False, default=0)
    status = Column(
        Enum("pending", "processing", "completed", "failed", name="import_status_enum"),
        nullable=False, default="pending",
    )
    error_log = Column(Text)
    mapping_json = Column(JSON)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class Template(Base):
    __tablename__ = "templates"
    __table_args__ = (UniqueConstraint("name", "channel", name="uq_templates_name_channel"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    channel = Column(Enum("email", "sms", "whatsapp", "call_script", "linkedin", name="template_channel_enum"), nullable=False)
    subject = Column(String(255))
    body = Column(Text, nullable=False)
    variables = Column(JSON)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    description = Column(Text)
    segment_filter = Column(
        Enum(*INDUSTRY_SEGMENTS, "all", name="campaign_segment_enum"),
        nullable=False, default="all",
    )
    status_filter = Column(String(64))
    status = Column(
        Enum("draft", "active", "paused", "completed", "archived", name="campaign_status_enum"),
        nullable=False, default="draft",
    )
    start_at = Column(DateTime)
    end_at = Column(DateTime)
    created_by = Column(String(128))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    steps = relationship("CampaignStep", back_populates="campaign", cascade="all, delete-orphan", order_by="CampaignStep.step_order")


class CampaignStep(Base):
    __tablename__ = "campaign_steps"
    __table_args__ = (UniqueConstraint("campaign_id", "step_order", name="uq_campaign_step_order"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    campaign_id = Column(BigInteger, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    step_order = Column(Integer, nullable=False)
    channel = Column(Enum("email", "sms", "whatsapp", "call", "task", "linkedin", "call_alert", name="step_channel_enum"), nullable=False)
    template_id = Column(BigInteger, ForeignKey("templates.id", ondelete="SET NULL"))
    delay_days = Column(Integer, nullable=False, default=0)
    delay_hours = Column(Integer, nullable=False, default=0)
    condition_json = Column(JSON)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    campaign = relationship("Campaign", back_populates="steps")
    template = relationship("Template")


class LeadDripState(Base):
    __tablename__ = "lead_drip_state"
    __table_args__ = (UniqueConstraint("lead_id", "campaign_id", name="uq_drip_lead_campaign"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    lead_id = Column(BigInteger, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    campaign_id = Column(BigInteger, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    current_step = Column(Integer, nullable=False, default=0)
    status = Column(
        Enum("active", "paused", "completed", "exited", "failed", name="drip_status_enum"),
        nullable=False, default="active",
    )
    next_run_at = Column(DateTime, index=True)
    last_step_at = Column(DateTime)
    attempts = Column(Integer, nullable=False, default=0)
    enrolled_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    lead = relationship("Lead", back_populates="drip_states")
    campaign = relationship("Campaign")


class CampaignEvent(Base):
    __tablename__ = "campaign_events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    lead_id = Column(BigInteger, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_id = Column(BigInteger, ForeignKey("campaigns.id", ondelete="SET NULL"), index=True)
    step_id = Column(BigInteger, ForeignKey("campaign_steps.id", ondelete="SET NULL"))
    event_type = Column(
        Enum(
            "sent", "delivered", "opened", "clicked", "replied",
            "bounced", "unsubscribed", "failed",
            "call_made", "call_answered", "note",
            name="event_type_enum",
        ),
        nullable=False, index=True,
    )
    channel = Column(
        Enum("email", "sms", "whatsapp", "call", "task", "system", "linkedin", "call_alert", name="event_channel_enum"),
        nullable=False, default="system",
    )
    payload = Column(JSON)
    occurred_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    lead = relationship("Lead", back_populates="events")
    campaign = relationship("Campaign")
    step = relationship("CampaignStep")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_emp_code = Column(String(32), nullable=False, index=True)
    type = Column(
        Enum("reply_received", "lead_qualified", "call_alert", "campaign_complete",
             name="notification_type_enum"),
        nullable=False,
    )
    title = Column(String(255), nullable=False)
    body = Column(Text)
    lead_id = Column(BigInteger, ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
