"""Deliverable Management System routes: admin CRUD over stage_deliverables,
student submission + upload + status endpoints, and AI/mentor review
endpoints. See sql/migrations/2026-08-20_01_deliverable_management.sql for
the schema and app/services/deliverable_service.py /
app/services/deliverable_review_service.py for the business logic."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.routes.auth import get_current_user, require_admin
from app.schemas.deliverables import (
    DeliverableReorderRequest,
    DeliverableReviewResponse,
    DeliverableSubmissionCreate,
    DeliverableSubmissionResponse,
    DeliverableWithSubmissionResponse,
    MentorReviewCreate,
    PresignedUploadRequest,
    PresignedUploadResponse,
    ReviewDecisionRequest,
    StageDeliverableCreate,
    StageDeliverableResponse,
    StageDeliverableUpdate,
    SubmissionFileAttachRequest,
    SubmissionFileResponse,
)
from app.services import deliverable_review_service, deliverable_service

router = APIRouter(prefix="/deliverables", tags=["deliverables"])
logger = logging.getLogger(__name__)


def _run_automatic_ai_review(db: Session, submission_id: int):
    """Review a student submission immediately after it is complete.

    File submissions call this after their file is attached; text/URL
    submissions call it after the submission row is created. A review outage
    must not turn a successful upload into a failed upload, so the submission
    stays available for retry while the exception is logged.
    """
    try:
        return deliverable_review_service.create_ai_review(db, submission_id)
    except Exception:
        db.rollback()
        logger.exception("Automatic AI review failed for submission %s", submission_id)
        return None


# ---------------------------------------------------------------------------
# Admin APIs
# ---------------------------------------------------------------------------

@router.post("/admin/deliverables", response_model=StageDeliverableResponse, status_code=201)
def create_deliverable(
    payload: StageDeliverableCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return deliverable_service.create_deliverable(db, payload)


@router.put("/admin/deliverables/{deliverable_id}", response_model=StageDeliverableResponse)
def update_deliverable(
    deliverable_id: int,
    payload: StageDeliverableUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return deliverable_service.update_deliverable(db, deliverable_id, payload)


@router.post("/admin/deliverables/{deliverable_id}/template", response_model=StageDeliverableResponse, status_code=201)
async def upload_deliverable_template(
    deliverable_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    data = await file.read()
    return deliverable_service.upload_deliverable_template(
        db,
        deliverable_id,
        file_name=file.filename or "template",
        data=data,
        content_type=file.content_type or "application/octet-stream",
    )


@router.delete("/admin/deliverables/{deliverable_id}", status_code=204)
def delete_deliverable(
    deliverable_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    deliverable_service.delete_deliverable(db, deliverable_id)
    return None


@router.get("/admin/stages/{stage_id}/deliverables", response_model=list[StageDeliverableResponse])
def get_deliverables_by_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return deliverable_service.list_deliverables_by_stage(db, stage_id)


@router.post("/admin/deliverables/reorder", response_model=list[StageDeliverableResponse])
def reorder_deliverables(
    payload: DeliverableReorderRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return deliverable_service.reorder_deliverables(db, payload)


# ---------------------------------------------------------------------------
# Student APIs
# ---------------------------------------------------------------------------

@router.get("/student/current-stage", response_model=list[DeliverableWithSubmissionResponse])
def get_current_stage_deliverables(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return deliverable_service.get_current_stage_deliverables(db, user.id)


@router.get("/student/stages/{stage_id}", response_model=list[DeliverableWithSubmissionResponse])
def get_stage_deliverables(
    stage_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return deliverable_service.get_stage_deliverables_for_user(db, user.id, stage_id)


@router.post("/student/submissions", response_model=DeliverableSubmissionResponse, status_code=201)
def submit_deliverable(
    payload: DeliverableSubmissionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    submission = deliverable_service.submit_deliverable(db, user.id, payload)
    # Text, URL, and GitHub submissions are complete as soon as their row is
    # created. File submissions are reviewed after attach_submission_file().
    if payload.submission_type.value != "file":
        _run_automatic_ai_review(db, submission.id)
    return submission


@router.post("/student/deliverables/{deliverable_id}/resubmit", response_model=DeliverableSubmissionResponse, status_code=201)
def resubmit_deliverable(
    deliverable_id: int,
    payload: DeliverableSubmissionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # A resubmission is just another attempt at the same deliverable -
    # next_attempt_number() in the service bumps attempt_number and the
    # deliverable_id in the path/body must agree.
    payload = payload.model_copy(update={"deliverable_id": deliverable_id})
    submission = deliverable_service.submit_deliverable(db, user.id, payload)
    if payload.submission_type.value != "file":
        _run_automatic_ai_review(db, submission.id)
    return submission


@router.post("/student/submissions/{submission_id}/files/presign", response_model=PresignedUploadResponse)
def presign_submission_file(
    submission_id: int,
    payload: PresignedUploadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    submission = deliverable_service.get_submission_status(db, submission_id, user.id)
    return deliverable_service.create_presigned_file_upload(submission.deliverable_id, payload)


@router.post("/student/submissions/{submission_id}/files", response_model=SubmissionFileResponse, status_code=201)
def attach_submission_file(
    submission_id: int,
    payload: SubmissionFileAttachRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    submission_file = deliverable_service.attach_submission_file(db, submission_id, user.id, payload)
    # The S3 upload is already attached and owned by the student, so the
    # submission is now ready for the same AI review used by admins.
    _run_automatic_ai_review(db, submission_id)
    return submission_file


@router.get("/student/submissions/{submission_id}", response_model=DeliverableSubmissionResponse)
def get_submission_status(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return deliverable_service.get_submission_status(db, submission_id, user.id)


@router.get("/student/submissions/{submission_id}/reviews", response_model=list[DeliverableReviewResponse])
def get_review_feedback(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return deliverable_service.get_review_feedback(db, submission_id, user.id)


# ---------------------------------------------------------------------------
# Review APIs
# ---------------------------------------------------------------------------

@router.post("/reviews/ai/{submission_id}", response_model=DeliverableReviewResponse, status_code=201)
def create_ai_review(
    submission_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return deliverable_review_service.create_ai_review(db, submission_id)


@router.post("/reviews/mentor/{submission_id}", response_model=DeliverableReviewResponse, status_code=201)
def create_mentor_review(
    submission_id: int,
    payload: MentorReviewCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return deliverable_review_service.create_mentor_review(db, submission_id, admin.id, payload)


@router.post("/reviews/{submission_id}/approve", response_model=DeliverableReviewResponse)
def approve_submission(
    submission_id: int,
    payload: ReviewDecisionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return deliverable_review_service.approve_submission(db, submission_id, admin.id, payload)


@router.post("/reviews/{submission_id}/reject", response_model=DeliverableReviewResponse)
def reject_submission(
    submission_id: int,
    payload: ReviewDecisionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return deliverable_review_service.reject_submission(db, submission_id, admin.id, payload)


@router.post("/reviews/{submission_id}/request-resubmission", response_model=DeliverableReviewResponse)
def request_resubmission(
    submission_id: int,
    payload: ReviewDecisionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return deliverable_review_service.request_resubmission(db, submission_id, admin.id, payload)
