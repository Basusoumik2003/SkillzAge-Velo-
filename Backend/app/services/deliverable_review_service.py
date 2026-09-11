"""AI + mentor review for deliverable submissions, and the stage-completion
logic that depends on review outcomes.

For document/pdf/image/video submissions, AI review reuses the existing
stage-document review pipeline (app/services/stage_document_review.py -
MarkItDown/PyPDF2 extraction, AI-content detection, LLM scoring against
PASSING_SCORE) applied to the submission's uploaded file. For text/url/
github_repository submissions there is no uploaded file to parse, so a
lighter heuristic check runs instead - this module owns that adaptation
without touching stage_document_review.py, which keeps serving its existing
project-stage-document callers unchanged."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import DeliverableReview, StudentDeliverableSubmission
from app.repositories import deliverable_repository as repo
from app.schemas.deliverables import MentorReviewCreate, ReviewDecisionRequest
from app.services.stage_document_review import PASSING_SCORE, run_stage_document_review

# Statuses that count as "resolved" for stage-completion purposes.
_APPROVED_STATUS = "approved"


def _require_submission(db: Session, submission_id: int) -> StudentDeliverableSubmission:
    submission = repo.get_submission(db, submission_id)
    if submission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return submission


_GITHUB_URL_RE = re.compile(r"^https?://(www\.)?github\.com/[\w.\-]+/[\w.\-]+/?$", re.IGNORECASE)
_URL_RE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)


def _review_text_submission(submission: StudentDeliverableSubmission, deliverable_name: str, pass_threshold: int = 60) -> dict:
    """Lightweight, non-LLM validation for text/url/github submissions -
    good enough to gate obviously-empty or malformed submissions before a
    mentor looks at them; a full LLM pass can be layered on later without
    changing this contract. Still runs each candidate's score against the
    stage's own pass_score_threshold, same as the file-review path."""
    text = str(submission.submission_text or "").strip()

    if submission.submission_type == "github_repository":
        valid = bool(_GITHUB_URL_RE.match(text))
        score = 80 if valid else 20
        feedback = (
            "Repository link looks valid."
            if valid
            else "This does not look like a valid GitHub repository URL (expected https://github.com/<owner>/<repo>)."
        )
        return {"score": score, "status": "approved" if score >= pass_threshold else "resubmission_required", "feedback": feedback}

    if submission.submission_type == "url":
        valid = bool(_URL_RE.match(text))
        score = 80 if valid else 20
        feedback = "Link looks valid." if valid else "This does not look like a valid URL."
        return {"score": score, "status": "approved" if score >= pass_threshold else "resubmission_required", "feedback": feedback}

    # Plain text deliverable.
    word_count = len(re.findall(r"\b[\w'-]+\b", text))
    has_content = word_count >= 40
    score = min(95, 50 + word_count) if has_content else max(10, word_count * 2)
    feedback = (
        f"Submission for '{deliverable_name}' has enough content for mentor review."
        if score >= pass_threshold
        else f"Submission for '{deliverable_name}' looks too short ({word_count} words). Add more detail before resubmitting."
    )
    return {"score": score, "status": "approved" if score >= pass_threshold else "resubmission_required", "feedback": feedback}


def create_ai_review(db: Session, submission_id: int) -> DeliverableReview:
    submission = _require_submission(db, submission_id)
    deliverable = repo.get_deliverable(db, submission.deliverable_id)
    deliverable_name = deliverable.deliverable_name if deliverable else "Deliverable"
    stage = repo.get_stage(db, submission.stage_id)
    # Admin-configured per-stage pass score (sql/migrations/2026-08-25_01_deliverable_gating.sql),
    # default 60 - replaces stage_document_review.PASSING_SCORE (a fixed 75)
    # for this specific "did this deliverable pass" decision.
    pass_threshold = (stage or {}).get("pass_score_threshold", 60)

    if submission.submission_type == "file":
        files = repo.list_files_for_submission(db, submission.id)
        if not files:
            outcome = {
                "score": 0,
                "status": "resubmission_required",
                "feedback": "No file was attached to this submission yet.",
            }
        else:
            latest_file = files[-1]
            review_result = run_stage_document_review(
                {
                    "document_url": latest_file.s3_url,
                    "document_name": latest_file.file_name,
                    "stage_title": (stage or {}).get("stage_name") or deliverable_name,
                    "deliverable": (stage or {}).get("expected_outcome") or deliverable_name,
                    "objective": (stage or {}).get("stage_objective") or (deliverable.deliverable_description if deliverable else ""),
                    "stage_context": (stage or {}).get("stage_context") or "",
                    "readiness_criteria": (stage or {}).get("readiness_criteria") or "",
                    "user_id": str(submission.user_id),
                    "project_name": "startup_journey_deliverable",
                }
            )
            if review_result.get("status") == "REJECTED":
                outcome = {"score": 0, "status": "resubmission_required", "feedback": review_result.get("message", "Submission was rejected by AI content screening.")}
            else:
                score = int(review_result.get("score") or 0)
                outcome = {
                    "score": score,
                    "status": "approved" if score >= pass_threshold else "resubmission_required",
                    "feedback": review_result.get("safe_student_feedback", ""),
                }
    else:
        outcome = _review_text_submission(submission, deliverable_name, pass_threshold)

    review = repo.create_review(
        db,
        submission_id=submission.id,
        reviewer_type="ai",
        score=outcome["score"],
        review_status=outcome["status"],
        feedback=outcome["feedback"],
        reviewed_by=None,
        reviewed_at=datetime.now(timezone.utc),
    )

    new_submission_status = "under_review" if outcome["status"] == "approved" else "resubmission_required"
    repo.update_submission_status(db, submission, new_submission_status)
    if outcome["status"] == "approved":
        _maybe_complete_stage(db, submission)

    return review


def create_mentor_review(
    db: Session, submission_id: int, reviewer_id, payload: MentorReviewCreate
) -> DeliverableReview:
    submission = _require_submission(db, submission_id)
    review = repo.create_review(
        db,
        submission_id=submission.id,
        reviewer_type="mentor",
        score=payload.score,
        review_status=payload.review_status.value,
        feedback=payload.feedback,
        reviewed_by=reviewer_id,
        reviewed_at=datetime.now(timezone.utc),
    )

    status_map = {
        "approved": "approved",
        "rejected": "rejected",
        "resubmission_required": "resubmission_required",
        "pending": "under_review",
    }
    repo.update_submission_status(db, submission, status_map.get(payload.review_status.value, "under_review"))
    if payload.review_status.value == "approved":
        _maybe_complete_stage(db, submission)

    return review


def _decide(db: Session, submission_id: int, reviewer_id, decision: str, payload: ReviewDecisionRequest) -> DeliverableReview:
    submission = _require_submission(db, submission_id)
    review = repo.create_review(
        db,
        submission_id=submission.id,
        reviewer_type="mentor",
        score=payload.score if payload.score is not None else (100 if decision == "approved" else 0),
        review_status=decision,
        feedback=payload.feedback,
        reviewed_by=reviewer_id,
        reviewed_at=datetime.now(timezone.utc),
    )
    repo.update_submission_status(db, submission, decision)
    if decision == "approved":
        _maybe_complete_stage(db, submission)
    return review


def approve_submission(db: Session, submission_id: int, reviewer_id, payload: ReviewDecisionRequest) -> DeliverableReview:
    return _decide(db, submission_id, reviewer_id, "approved", payload)


def reject_submission(db: Session, submission_id: int, reviewer_id, payload: ReviewDecisionRequest) -> DeliverableReview:
    return _decide(db, submission_id, reviewer_id, "rejected", payload)


def request_resubmission(db: Session, submission_id: int, reviewer_id, payload: ReviewDecisionRequest) -> DeliverableReview:
    return _decide(db, submission_id, reviewer_id, "resubmission_required", payload)


def _maybe_complete_stage(db: Session, submission: StudentDeliverableSubmission) -> None:
    """Stage completion is deliverable-driven: once every *required*
    deliverable for the stage has an approved submission from this student,
    mark the stage complete in student_stage_progress (existing table/logic
    in app/services/startup_progress.py, untouched - this just calls it)."""
    from app.services.startup_progress import mark_stage_complete

    stage = repo.get_stage(db, submission.stage_id)
    # The admin's stage-level "Docs required to advance?" checkbox
    # (journey_stages.requires_deliverables) is the master switch - when
    # off, this stage is never gated by deliverables even if individual
    # ones are still marked is_required (e.g. left over from before the
    # checkbox was unchecked).
    if not (stage or {}).get("requires_deliverables"):
        return

    required_deliverables = [
        d for d in repo.list_deliverables_by_stage(db, submission.stage_id) if d.is_required
    ]
    if not required_deliverables:
        return

    for deliverable in required_deliverables:
        latest = repo.latest_submission_for_user_deliverable(db, submission.user_id, deliverable.id)
        if latest is None or latest.status != _APPROVED_STATUS:
            return

    mark_stage_complete(db, submission.user_id, phase_id=submission.phase_id, stage_id=submission.stage_id)
