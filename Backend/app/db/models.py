from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class User(Base):
    """Maps to SkillzAge's own `users` table (001_create_users_table).
    This app does NOT create/migrate this table - id is UUID, and the
    display-name column is physically called `full_name`, aliased here
    as `.name` for the rest of the codebase to keep working unchanged.
    `resume_text` is used by the resume upload flow and mentor context
    builder; the other auth-only columns are intentionally omitted since
    this service never needs them."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True)
    name = Column("full_name", String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    resume_text = Column(Text, default="")

    projects = relationship(
        "ProjectProgress",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    subscription = relationship(
        "Subscription",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )


class ProjectProgress(Base):
    __tablename__ = "project_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    project_name = Column(String(120), nullable=False)
    current_step = Column(Integer, default=1)
    completed_tasks = Column(Text, default="")

    user = relationship("User", back_populates="projects")


class StudentStageProgress(Base):
    """Per-stage progress for the startup-journey flow (sql/migrations/
    2026-08-13_01_startup_journey_schema.sql). Keyed by journey_phases/
    journey_stages FK ids rather than a free-text project_name - this is the
    startup-journey equivalent of ProjectProgress, used only for projects
    where context_builder.is_startup_project() is true. ProjectProgress
    itself is unchanged and still used for every other project type."""

    __tablename__ = "student_stage_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    profile_id = Column(UUID(as_uuid=True), nullable=True)
    idea_id = Column(UUID(as_uuid=True), nullable=True)
    phase_id = Column(Integer, nullable=True)
    stage_id = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="not_started")
    progress_percent = Column(Integer, nullable=False, default=0)
    last_question = Column(Text, default="")
    last_answer = Column(Text, default="")
    stage_notes = Column(Text, default="")
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class StageDeliverable(Base):
    """Admin-configured deliverable slot for one journey_stages row."""

    __tablename__ = "stage_deliverables"

    id = Column(Integer, primary_key=True, index=True)
    stage_id = Column(Integer, nullable=False, index=True)
    deliverable_name = Column(String(255), nullable=False)
    deliverable_description = Column(Text, nullable=False, default="")
    deliverable_type = Column(String(50), nullable=False, default="document")
    is_required = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=1)
    template_url = Column(Text, nullable=False, default="")
    template_original_filename = Column(String(255), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    submissions = relationship(
        "StudentDeliverableSubmission",
        back_populates="deliverable",
        cascade="all, delete-orphan"
    )


class StudentDeliverableSubmission(Base):
    """One student's attempt at a stage_deliverables slot."""

    __tablename__ = "student_deliverable_submissions"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    phase_id = Column(Integer, nullable=False)
    stage_id = Column(Integer, nullable=False, index=True)
    deliverable_id = Column(
        Integer,
        ForeignKey("stage_deliverables.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    submission_type = Column(String(50), nullable=False, default="file")
    submission_text = Column(Text, nullable=False, default="")
    status = Column(String(30), nullable=False, default="submitted", index=True)
    attempt_number = Column(Integer, nullable=False, default=1)
    submitted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    deliverable = relationship(
        "StageDeliverable",
        back_populates="submissions"
    )

    files = relationship(
        "SubmissionFile",
        back_populates="submission",
        cascade="all, delete-orphan"
    )

    reviews = relationship(
        "DeliverableReview",
        back_populates="submission",
        cascade="all, delete-orphan"
    )


class SubmissionFile(Base):
    """S3-backed file attached to a submission."""

    __tablename__ = "submission_files"

    id = Column(BigInteger, primary_key=True, index=True)
    submission_id = Column(
        BigInteger,
        ForeignKey(
            "student_deliverable_submissions.id",
            ondelete="CASCADE"
        ),
        nullable=False,
        index=True
    )
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False, default="")
    file_size = Column(BigInteger, nullable=False, default=0)
    s3_url = Column(Text, nullable=False)
    s3_key = Column(Text, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    submission = relationship(
        "StudentDeliverableSubmission",
        back_populates="files"
    )


class DeliverableReview(Base):
    """AI or mentor review of one submission."""

    __tablename__ = "deliverable_reviews"

    id = Column(BigInteger, primary_key=True, index=True)
    submission_id = Column(
        BigInteger,
        ForeignKey(
            "student_deliverable_submissions.id",
            ondelete="CASCADE"
        ),
        nullable=False,
        index=True
    )
    reviewer_type = Column(String(20), nullable=False, index=True)
    score = Column(Integer, nullable=False, default=0)
    review_status = Column(String(20), nullable=False, default="pending", index=True)
    feedback = Column(Text, nullable=False, default="")
    reviewed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    submission = relationship(
        "StudentDeliverableSubmission",
        back_populates="reviews"
    )


class Company(Base):
    """Admin-managed company/tenant catalog."""

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
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    project_name = Column(String(160), nullable=False, index=True)
    mentor_id = Column(
        Integer,
        ForeignKey("project_mentors.id", ondelete="SET NULL"),
        nullable=True
    )
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
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
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
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True
    )
    plan = Column(String(50), nullable=False, default="free")
    status = Column(String(50), nullable=False, default="inactive")
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    provider = Column(String(50), nullable=True)
    provider_customer_id = Column(String(120), nullable=True)
    provider_subscription_id = Column(String(120), nullable=True)

    user = relationship("User", back_populates="subscription")


# ==========================================================
# PROJECT PURCHASE / ACCESS
# ==========================================================

class UserProjectAccess(Base):
    __tablename__ = "user_project_access"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    access_status = Column(
        String(20),
        nullable=False,
        default="active"
    )
    project_status = Column(
        String(20),
        nullable=False,
        default="not_started"
    )
    purchased_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    user = relationship("User")
    project = relationship("Project")


# ==========================================================
# PAYMENT TRANSACTIONS
# ==========================================================

class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    provider = Column(
        String(30),
        nullable=False,
        default="razorpay"
    )
    provider_order_id = Column(String(150), nullable=True)
    provider_payment_id = Column(String(150), nullable=True)
    provider_signature = Column(String(255), nullable=True)
    amount_paise = Column(BigInteger, nullable=False)
    currency = Column(String(10), nullable=False, default="INR")
    payment_status = Column(
        String(20),
        nullable=False,
        default="created"
    )
    paid_at = Column(DateTime(timezone=True), nullable=True)
    # `metadata` is reserved by SQLAlchemy's Declarative API, so map the
    # "metadata" column to a differently named attribute.
    transaction_metadata = Column("metadata", JSON, nullable=False, default=dict)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    user = relationship("User")
    project = relationship("Project")


# ==========================================================
# WIX PRODUCT ↔ PROJECT MAPPING
# ==========================================================

class ProjectProductMapping(Base):
    __tablename__ = "project_product_mapping"

    id = Column(BigInteger, primary_key=True, index=True)
    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    wix_product_id = Column(String(150), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    project = relationship("Project")


# ==========================================================
# USER PROJECT DETAILS
# ==========================================================

class UserProjectDetails(Base):
    __tablename__ = "user_project_details"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    details = Column(JSON, nullable=False, default=dict)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    user = relationship("User")
    project = relationship("Project")


# ==========================================================
# PROJECT ONBOARDING FIELDS
# ==========================================================

class ProjectOnboardingField(Base):
    __tablename__ = "project_onboarding_fields"

    id = Column(BigInteger, primary_key=True, index=True)
    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    field_key = Column(String(100), nullable=False)
    field_label = Column(String(200), nullable=False)
    field_type = Column(
        String(30),
        nullable=False,
        default="text"
    )
    is_required = Column(Boolean, nullable=False, default=False)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    options = Column(JSON, nullable=False, default=list)
    placeholder = Column(Text, nullable=False, default="")
    help_text = Column(Text, nullable=False, default="")
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    project = relationship("Project")