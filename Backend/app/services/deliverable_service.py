"""Business logic for stage_deliverables (admin config) and
student_deliverable_submissions (student side). Review/scoring logic lives in
app/services/deliverable_review_service.py."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import StageDeliverable, StudentDeliverableSubmission, SubmissionFile
from app.repositories import deliverable_repository as repo
from app.schemas.deliverables import (
    DeliverableReorderRequest,
    DeliverableSubmissionCreate,
    DeliverableWithSubmissionResponse,
    PresignedUploadRequest,
    StageDeliverableCreate,
    StageDeliverableResponse,
    StageDeliverableUpdate,
    SubmissionFileAttachRequest,
    SubmissionFileResponse,
)
from app.services import s3_service


def _require_stage(db: Session, stage_id: int) -> dict:
    stage = repo.get_stage(db, stage_id)
    if stage is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stage not found.")
    return stage


def _require_deliverable(db: Session, deliverable_id: int) -> StageDeliverable:
    deliverable = repo.get_deliverable(db, deliverable_id)
    if deliverable is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Deliverable not found.")
    return deliverable


def _require_submission(db: Session, submission_id: int) -> StudentDeliverableSubmission:
    submission = repo.get_submission(db, submission_id)
    if submission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return submission


# ---------------------------------------------------------------------------
# Admin: deliverable configuration
# ---------------------------------------------------------------------------

def create_deliverable(db: Session, payload: StageDeliverableCreate) -> StageDeliverable:
    _require_stage(db, payload.stage_id)
    display_order = payload.display_order or repo.next_display_order(db, payload.stage_id)
    return repo.create_deliverable(
        db,
        stage_id=payload.stage_id,
        deliverable_name=payload.deliverable_name,
        deliverable_description=payload.deliverable_description,
        deliverable_type=payload.deliverable_type.value,
        is_required=payload.is_required,
        display_order=display_order,
    )


def update_deliverable(db: Session, deliverable_id: int, payload: StageDeliverableUpdate) -> StageDeliverable:
    deliverable = _require_deliverable(db, deliverable_id)
    fields = payload.model_dump(exclude_unset=True)
    if "deliverable_type" in fields and fields["deliverable_type"] is not None:
        fields["deliverable_type"] = fields["deliverable_type"].value if hasattr(fields["deliverable_type"], "value") else fields["deliverable_type"]
    return repo.update_deliverable(db, deliverable, **fields)


def upload_deliverable_template(
    db: Session, deliverable_id: int, *, file_name: str, data: bytes, content_type: str
) -> StageDeliverable:
    """Admin-side upload of the demo/template file students download before
    filling out this deliverable. Server-side upload (not presigned) since
    this is a low-frequency admin action, not a student-scale upload path."""
    deliverable = _require_deliverable(db, deliverable_id)
    uploaded = s3_service.upload_bytes(
        folder=f"deliverable-templates/{deliverable_id}",
        file_name=file_name,
        data=data,
        content_type=content_type or "application/octet-stream",
    )
    return repo.update_deliverable(
        db,
        deliverable,
        template_url=uploaded["s3_url"],
        template_original_filename=file_name,
    )


def delete_deliverable(db: Session, deliverable_id: int) -> None:
    deliverable = _require_deliverable(db, deliverable_id)
    repo.delete_deliverable(db, deliverable)


def list_deliverables_by_stage(db: Session, stage_id: int) -> list[StageDeliverable]:
    _require_stage(db, stage_id)
    return repo.list_deliverables_by_stage(db, stage_id)


def reorder_deliverables(db: Session, payload: DeliverableReorderRequest) -> list[StageDeliverable]:
    _require_stage(db, payload.stage_id)
    items = [{"id": item.id, "display_order": item.display_order} for item in payload.items]
    return repo.reorder_deliverables(db, payload.stage_id, items)


# ---------------------------------------------------------------------------
# Student: reading deliverables + submission state
# ---------------------------------------------------------------------------

def get_current_stage_deliverables(db: Session, user_id) -> list[DeliverableWithSubmissionResponse]:
    stage = repo.get_current_stage_for_user(db, user_id)
    if stage is None:
        return []
    return get_stage_deliverables_for_user(db, user_id, stage["id"])


def get_stage_deliverables_for_user(db: Session, user_id, stage_id: int) -> list[DeliverableWithSubmissionResponse]:
    _require_stage(db, stage_id)
    deliverables = repo.list_deliverables_by_stage(db, stage_id)
    results: list[DeliverableWithSubmissionResponse] = []
    for deliverable in deliverables:
        submissions = repo.list_submissions_for_user_deliverable(db, user_id, deliverable.id)
        latest = submissions[0] if submissions else None
        results.append(
            DeliverableWithSubmissionResponse(
                deliverable=StageDeliverableResponse.model_validate(deliverable),
                latest_submission=_submission_response(latest) if latest else None,
                submission_count=len(submissions),
            )
        )
    return results


def _submission_response(submission: StudentDeliverableSubmission):
    from app.schemas.deliverables import DeliverableSubmissionResponse

    return DeliverableSubmissionResponse.model_validate(submission)


# ---------------------------------------------------------------------------
# Student: submit / resubmit
# ---------------------------------------------------------------------------

def submit_deliverable(db: Session, user_id, payload: DeliverableSubmissionCreate) -> StudentDeliverableSubmission:
    deliverable = _require_deliverable(db, payload.deliverable_id)
    stage = _require_stage(db, deliverable.stage_id)
    attempt_number = repo.next_attempt_number(db, user_id, deliverable.id)

    submission = repo.create_submission(
        db,
        user_id=user_id,
        phase_id=stage["phase_id"],
        stage_id=deliverable.stage_id,
        deliverable_id=deliverable.id,
        submission_type=payload.submission_type.value,
        submission_text=payload.submission_text,
        status="submitted",
        attempt_number=attempt_number,
    )
    return submission


def create_presigned_file_upload(deliverable_id: int, payload: PresignedUploadRequest) -> dict:
    return s3_service.create_presigned_upload(
        folder=f"deliverables/{deliverable_id}",
        file_name=payload.file_name,
        content_type=payload.file_type or "application/octet-stream",
    )


def _require_owned_submission(db: Session, submission_id: int, user_id) -> StudentDeliverableSubmission:
    submission = _require_submission(db, submission_id)
    if str(submission.user_id) != str(user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="This submission does not belong to you.")
    return submission


def attach_submission_file(db: Session, submission_id: int, user_id, payload: SubmissionFileAttachRequest) -> SubmissionFile:
    submission = _require_owned_submission(db, submission_id, user_id)
    submission_file = repo.add_submission_file(
        db,
        submission_id=submission.id,
        file_name=payload.file_name,
        file_type=payload.file_type,
        file_size=payload.file_size,
        s3_url=payload.s3_url,
        s3_key=payload.s3_key,
    )
    return submission_file


def get_submission_status(db: Session, submission_id: int, user_id) -> StudentDeliverableSubmission:
    return _require_owned_submission(db, submission_id, user_id)


def get_review_feedback(db: Session, submission_id: int, user_id):
    _require_owned_submission(db, submission_id, user_id)
    return repo.list_reviews_for_submission(db, submission_id)
