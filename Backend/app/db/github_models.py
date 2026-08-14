from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class GitHubRepository(Base):
    __tablename__ = "github_repositories"
    __table_args__ = (
        UniqueConstraint("user_id", "project_name", name="uq_github_repositories_user_project"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    project_name = Column(String(160), nullable=False, default="", index=True)
    github_username = Column(String(120), nullable=False)
    repository_url = Column(String(255), nullable=False)
    branch_name = Column(String(120), nullable=False, default="main")
    webhook_id = Column(BigInteger, nullable=True, index=True)
    last_commit_hash = Column(String(120), nullable=True)
    last_reviewed_commit = Column(String(120), nullable=True)
    last_pull_at = Column(DateTime(timezone=True), nullable=True)
    last_scheduler_check = Column(DateTime(timezone=True), nullable=True)
    webhook_enabled = Column(Boolean, nullable=False, default=False)
    default_branch = Column(String(120), nullable=False, default="main")
    connection_status = Column(String(50), nullable=False, default="disconnected")
    connection_verified_at = Column(DateTime(timezone=True), nullable=True)
    connected_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user = relationship("User")


class CodeReview(Base):
    __tablename__ = "code_reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    project_name = Column(String(120), nullable=False)
    commit_hash = Column(String(120), nullable=False, index=True)
    changed_files = Column(Text, nullable=False, default="[]")
    review_feedback = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user = relationship("User")


class GitHubAppSettings(Base):
    __tablename__ = "github_app_settings"

    id = Column(Integer, primary_key=True, index=True)
    github_token = Column(Text, nullable=False, default="")
    webhook_secret = Column(Text, nullable=False, default="")
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
