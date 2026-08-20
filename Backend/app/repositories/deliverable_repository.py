"""Data access for the Deliverable Management System. journey_phases /
journey_stages have no SQLAlchemy model in this app (see the comment on
StudentStageProgress in app/db/models.py) so the small amount of lookups this
subsystem needs against them goes through raw SQL here, same convention as
app/services/startup_progress.py."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import (
    DeliverableReview,
    StageDeliverable,
    StudentDeliverableSubmission,
    SubmissionFile,
)


# ---------------------------------------------------------------------------
# journey_stages / journey_phases lookups (unmapped tables, raw SQL)
# ---------------------------------------------------------------------------

def get_stage(db: Session, stage_id: int) -> Optional[dict[str, Any]]:
    row = db.execute(
        text(
            """
            SELECT id, phase_id, stage_name, stage_order, is_active
            FROM journey_stages
            WHERE id = :stage_id
            """
        ),
        {"stage_id": stage_id},
    ).mappings().first()
    return dict(row) if row else None


def get_current_stage_for_user(db: Session, user_id) -> Optional[dict[str, Any]]:
    """Resolves the student's current (first not-completed, active) stage,
    reusing the same completion logic as
    app.services.startup_progress.get_startup_progress_state."""
    from app.services.startup_progress import get_startup_progress_state

    state = get_startup_progress_state(db, user_id)
    current_stages = state.get("current_stages") or []
    current_phase = state.get("current_phase") or {}
    if not current_stages:
        return None
    stage = current_stages[0]
    return {
        "id": stage["id"],
        "phase_id": current_phase.get("id"),
        "stage_name": stage.get("stage_name"),
        "stage_order": stage.get("stage_order"),
    }


# ---------------------------------------------------------------------------
# stage_deliverables
# ---------------------------------------------------------------------------

def get_deliverable(db: Session, deliverable_id: int) -> Optional[StageDeliverable]:
    return db.query(StageDeliverable).filter(StageDeliverable.id == deliverable_id).first()


def list_deliverables_by_stage(db: Session, stage_id: int) -> list[StageDeliverable]:
    return (
        db.query(StageDeliverable)
        .filter(StageDeliverable.stage_id == stage_id)
        .order_by(StageDeliverable.display_order.asc(), StageDeliverable.id.asc())
        .all()
    )


def next_display_order(db: Session, stage_id: int) -> int:
    current_max = (
        db.query(StageDeliverable.display_order)
        .filter(StageDeliverable.stage_id == stage_id)
        .order_by(StageDeliverable.display_order.desc())
        .first()
    )
    return (current_max[0] if current_max else 0) + 1


def create_deliverable(db: Session, **fields) -> StageDeliverable:
    deliverable = StageDeliverable(**fields)
    db.add(deliverable)
    db.commit()
    db.refresh(deliverable)
    return deliverable


def update_deliverable(db: Session, deliverable: StageDeliverable, **fields) -> StageDeliverable:
    for key, value in fields.items():
        if value is not None:
            setattr(deliverable, key, value)
    db.add(deliverable)
    db.commit()
    db.refresh(deliverable)
    return deliverable


def delete_deliverable(db: Session, deliverable: StageDeliverable) -> None:
    db.delete(deliverable)
    db.commit()


def reorder_deliverables(db: Session, stage_id: int, items: list[dict[str, int]]) -> list[StageDeliverable]:
    """Two-pass update (push everything to negative placeholders first) so
    the (stage_id, display_order) unique constraint never collides
    mid-transaction when orders are being swapped."""
    ids = [item["id"] for item in items]
    deliverables = (
        db.query(StageDeliverable)
        .filter(StageDeliverable.stage_id == stage_id, StageDeliverable.id.in_(ids))
        .all()
    )
    by_id = {d.id: d for d in deliverables}

    for item in items:
        deliverable = by_id.get(item["id"])
        if deliverable is not None:
            deliverable.display_order = -item["display_order"]
    db.flush()

    for item in items:
        deliverable = by_id.get(item["id"])
        if deliverable is not None:
            deliverable.display_order = item["display_order"]
    db.commit()

    return list_deliverables_by_stage(db, stage_id)


# ---------------------------------------------------------------------------
# student_deliverable_submissions
# ---------------------------------------------------------------------------

def get_submission(db: Session, submission_id: int) -> Optional[StudentDeliverableSubmission]:
    return (
        db.query(StudentDeliverableSubmission)
        .filter(StudentDeliverableSubmission.id == submission_id)
        .first()
    )


def list_submissions_for_user_deliverable(
    db: Session, user_id, deliverable_id: int
) -> list[StudentDeliverableSubmission]:
    return (
        db.query(StudentDeliverableSubmission)
        .filter(
            StudentDeliverableSubmission.user_id == user_id,
            StudentDeliverableSubmission.deliverable_id == deliverable_id,
        )
        .order_by(StudentDeliverableSubmission.attempt_number.desc())
        .all()
    )


def latest_submission_for_user_deliverable(
    db: Session, user_id, deliverable_id: int
) -> Optional[StudentDeliverableSubmission]:
    return (
        db.query(StudentDeliverableSubmission)
        .filter(
            StudentDeliverableSubmission.user_id == user_id,
            StudentDeliverableSubmission.deliverable_id == deliverable_id,
        )
        .order_by(StudentDeliverableSubmission.attempt_number.desc())
        .first()
    )


def next_attempt_number(db: Session, user_id, deliverable_id: int) -> int:
    latest = latest_submission_for_user_deliverable(db, user_id, deliverable_id)
    return (latest.attempt_number if latest else 0) + 1


def create_submission(db: Session, **fields) -> StudentDeliverableSubmission:
    submission = StudentDeliverableSubmission(**fields)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def update_submission_status(
    db: Session, submission: StudentDeliverableSubmission, status: str
) -> StudentDeliverableSubmission:
    submission.status = status
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


# ---------------------------------------------------------------------------
# submission_files
# ---------------------------------------------------------------------------

def add_submission_file(db: Session, **fields) -> SubmissionFile:
    submission_file = SubmissionFile(**fields)
    db.add(submission_file)
    db.commit()
    db.refresh(submission_file)
    return submission_file


def list_files_for_submission(db: Session, submission_id: int) -> list[SubmissionFile]:
    return (
        db.query(SubmissionFile)
        .filter(SubmissionFile.submission_id == submission_id)
        .order_by(SubmissionFile.uploaded_at.asc())
        .all()
    )


# ---------------------------------------------------------------------------
# deliverable_reviews
# ---------------------------------------------------------------------------

def create_review(db: Session, **fields) -> DeliverableReview:
    review = DeliverableReview(**fields)
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def list_reviews_for_submission(db: Session, submission_id: int) -> list[DeliverableReview]:
    return (
        db.query(DeliverableReview)
        .filter(DeliverableReview.submission_id == submission_id)
        .order_by(DeliverableReview.created_at.desc())
        .all()
    )


def latest_review_for_submission(
    db: Session, submission_id: int, reviewer_type: Optional[str] = None
) -> Optional[DeliverableReview]:
    query = db.query(DeliverableReview).filter(DeliverableReview.submission_id == submission_id)
    if reviewer_type:
        query = query.filter(DeliverableReview.reviewer_type == reviewer_type)
    return query.order_by(DeliverableReview.created_at.desc()).first()
