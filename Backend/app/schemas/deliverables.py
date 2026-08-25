"""Pydantic schemas for the Deliverable Management System (stage_deliverables,
student_deliverable_submissions, submission_files, deliverable_reviews - see
sql/migrations/2026-08-20_01_deliverable_management.sql)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DeliverableType(str, Enum):
    document = "document"
    pdf = "pdf"
    image = "image"
    video = "video"
    github_repository = "github_repository"
    url = "url"
    text = "text"


# Deliverable types that expect an uploaded file vs. a text/link submission.
FILE_DELIVERABLE_TYPES = {
    DeliverableType.document,
    DeliverableType.pdf,
    DeliverableType.image,
    DeliverableType.video,
}


class SubmissionType(str, Enum):
    file = "file"
    text = "text"
    github_repository = "github_repository"
    url = "url"


class SubmissionStatus(str, Enum):
    submitted = "submitted"
    under_review = "under_review"
    approved = "approved"
    rejected = "rejected"
    resubmission_required = "resubmission_required"


class ReviewerType(str, Enum):
    ai = "ai"
    mentor = "mentor"


class ReviewStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    resubmission_required = "resubmission_required"


# ---------------------------------------------------------------------------
# stage_deliverables (admin configuration)
# ---------------------------------------------------------------------------

class StageDeliverableCreate(BaseModel):
    stage_id: int
    deliverable_name: str = Field(min_length=1, max_length=255)
    deliverable_description: str = ""
    deliverable_type: DeliverableType = DeliverableType.document
    is_required: bool = True
    # Optional - the service assigns the next free display_order for the
    # stage when omitted, so admins don't have to hand-manage ordering.
    display_order: Optional[int] = None

    @field_validator("deliverable_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("deliverable_name cannot be blank.")
        return value


class StageDeliverableUpdate(BaseModel):
    deliverable_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    deliverable_description: Optional[str] = None
    deliverable_type: Optional[DeliverableType] = None
    is_required: Optional[bool] = None
    display_order: Optional[int] = None


class DeliverableReorderItem(BaseModel):
    id: int
    display_order: int = Field(ge=1)


class DeliverableReorderRequest(BaseModel):
    stage_id: int
    items: list[DeliverableReorderItem] = Field(min_length=1)


class StageDeliverableResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stage_id: int
    deliverable_name: str
    deliverable_description: str
    deliverable_type: DeliverableType
    is_required: bool
    display_order: int
    template_url: str = ""
    template_original_filename: str = ""
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# submission_files
# ---------------------------------------------------------------------------

class SubmissionFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submission_id: int
    file_name: str
    file_type: str
    file_size: int
    s3_url: str
    uploaded_at: datetime


# ---------------------------------------------------------------------------
# deliverable_reviews
# ---------------------------------------------------------------------------

class DeliverableReviewCreate(BaseModel):
    submission_id: int
    score: int = Field(ge=0, le=100, default=0)
    review_status: ReviewStatus = ReviewStatus.pending
    feedback: str = ""


class MentorReviewCreate(BaseModel):
    score: int = Field(ge=0, le=100)
    review_status: ReviewStatus
    feedback: str = ""


class ReviewDecisionRequest(BaseModel):
    """Body for the approve/reject/request-resubmission endpoints - feedback
    is optional since a mentor may approve without extra comments."""

    feedback: str = ""
    score: Optional[int] = Field(default=None, ge=0, le=100)


class DeliverableReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submission_id: int
    reviewer_type: ReviewerType
    score: int
    review_status: ReviewStatus
    feedback: str
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# student_deliverable_submissions
# ---------------------------------------------------------------------------

class DeliverableSubmissionCreate(BaseModel):
    deliverable_id: int
    submission_type: SubmissionType
    # Text-based submissions (text / github_repository / url) carry their
    # payload here; file submissions attach files via the separate upload
    # endpoint after the submission row exists.
    submission_text: str = ""

    @field_validator("submission_text")
    @classmethod
    def _validate_text_payload(cls, value: str, info) -> str:
        submission_type = info.data.get("submission_type")
        if submission_type in (SubmissionType.text, SubmissionType.github_repository, SubmissionType.url):
            if not value.strip():
                raise ValueError(f"submission_text is required for submission_type '{submission_type.value}'.")
        return value


class DeliverableSubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: UUID
    phase_id: int
    stage_id: int
    deliverable_id: int
    submission_type: SubmissionType
    submission_text: str
    status: SubmissionStatus
    attempt_number: int
    submitted_at: datetime
    updated_at: datetime
    files: list[SubmissionFileResponse] = []
    reviews: list[DeliverableReviewResponse] = []


class DeliverableWithSubmissionResponse(BaseModel):
    """What the student workspace renders per deliverable: the admin config
    plus that student's latest submission (if any)."""

    deliverable: StageDeliverableResponse
    latest_submission: Optional[DeliverableSubmissionResponse] = None
    submission_count: int = 0


class PresignedUploadRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    file_type: str = ""
    file_size: int = Field(ge=0, default=0)


class PresignedUploadResponse(BaseModel):
    """Direct-to-S3 upload contract: the client PUTs the raw file to
    `upload_url` with header `Content-Type: <file_type>`, then calls
    `POST /deliverables/submissions/{id}/files` with the returned `s3_key`/
    `s3_url` to attach it to the submission."""

    upload_url: str
    s3_key: str
    s3_url: str
    expires_in_seconds: int


class SubmissionFileAttachRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    file_type: str = ""
    file_size: int = Field(ge=0, default=0)
    s3_key: str
    s3_url: str
