from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class User(Base):
    """Maps to SkillzAge's own `users` table (001_create_users_table).
    This app does NOT create/migrate this table - id is UUID, and the
    display-name column is physically called `full_name`, aliased here
    as `.name` for the rest of the codebase to keep working unchanged.
    `resume_text`/`gender`/`password_hash` etc. are intentionally omitted
    since this service never needs them."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True)
    name = Column("full_name", String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)

    projects = relationship("ProjectProgress", back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")


class ProjectProgress(Base):
    __tablename__ = "project_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    project_name = Column(String(120), nullable=False)
    current_step = Column(Integer, default=1)
    completed_tasks = Column(Text, default="")

    user = relationship("User", back_populates="projects")


class Company(Base):
    """Admin-managed company/tenant catalog (sql/schema.sql, section 8)."""

    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(160), nullable=False)
    slug = Column(String(180), unique=True, nullable=False)
    industry = Column(String(120), nullable=False, default="")
    description = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    projects = relationship("Project", back_populates="company")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text, default="")
    timeline_weeks = Column(Integer, default=4)
    category = Column(String(40), default="normal")
    global_category = Column(String(80), default="")
    is_active = Column(Boolean, default=True)
    is_demo_project = Column(Boolean, default=False)
    introduction_document = Column(Text, default="")
    introduction_document_url = Column(Text, default="")
    company_profile_text = Column(Text, default="")
    private_brd_document = Column(Text, default="")
    private_brd_document_url = Column(Text, default="")
    solution_document = Column(Text, default="")
    solution_document_url = Column(Text, default="")
    steps_json = Column(JSON, default=list)

    company = relationship("Company", back_populates="projects")


class Mentor(Base):
    __tablename__ = "project_mentors"

    id = Column(Integer, primary_key=True, index=True)
    agent_key = Column(String(50), unique=True, nullable=False)
    mentor_name = Column(String(100), nullable=False)
    role = Column(Text, nullable=False)
    goal = Column(Text, nullable=False)
    backstory = Column(Text, nullable=False)
    avatar_url = Column(Text, nullable=False, default="")
    avatar_public_id = Column(Text, nullable=False, default="")
    is_hidden = Column(Boolean, default=False)
    output_format = Column(String(20), nullable=False, default="markdown")


class MentorChatMessage(Base):
    __tablename__ = "mentor_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_name = Column(String(160), nullable=False, index=True)
    mentor_id = Column(Integer, ForeignKey("project_mentors.id", ondelete="SET NULL"), nullable=True)
    agent_key = Column(String(50), nullable=False, default="")
    agent_name = Column(String(100), nullable=False, default="")
    role = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
    meta = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AIUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(40), nullable=False)
    model = Column(String(160), nullable=False)
    feature = Column(String(80), nullable=False)
    route = Column(String(160), nullable=False, default="")
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    project_name = Column(String(160), nullable=False, default="")
    related_table = Column(String(120), nullable=False, default="")
    related_id = Column(Integer, nullable=True)
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cached_tokens = Column(Integer, nullable=False, default=0)
    billable_units = Column(Integer, nullable=False, default=0)
    raw_usage = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    plan = Column(String(50), nullable=False, default="free")
    status = Column(String(50), nullable=False, default="inactive")
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    provider = Column(String(50), nullable=True)
    provider_customer_id = Column(String(120), nullable=True)
    provider_subscription_id = Column(String(120), nullable=True)

    user = relationship("User", back_populates="subscription")
