"""Startup-journey stage progress, backed by `student_stage_progress`
(sql/migrations/2026-08-13_01_startup_journey_schema.sql) instead of the
generic `project_progress` table.

This is the startup-journey-only equivalent of ProjectProgress.current_step /
ProjectProgress.completed_tasks - it is only used for projects where
context_builder.is_startup_project() is true. Every other project type keeps
reading/writing ProjectProgress unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import StudentStageProgress


def ensure_student_profile(db: Session, user_id) -> object:
    """Fetch or create the user's user_profiles row, returning its id.

    The Wix profile form writes public.user_profiles; the startup-journey code
    reads/writes the same table (see migration 2026-09-02_01)."""
    row = db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :user_id LIMIT 1"),
        {"user_id": user_id},
    ).first()
    if row:
        return row[0]

    row = db.execute(
        text("INSERT INTO user_profiles (user_id) VALUES (:user_id) RETURNING id"),
        {"user_id": user_id},
    ).first()
    db.commit()
    return row[0]


def _active_phases(db: Session) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT id, phase_order, phase_name, phase_description
            FROM journey_phases
            WHERE is_active = TRUE
            ORDER BY phase_order ASC
            """
        )
    ).mappings().all()
    return [dict(row) for row in rows]


def _active_stages_by_phase(db: Session, phase_ids: list[int]) -> dict[int, list[dict]]:
    if not phase_ids:
        return {}
    rows = db.execute(
        text(
            """
            SELECT id, phase_id, stage_order, stage_name, stage_context, stage_objective,
                   expected_outcome, readiness_criteria, recommended_actions
            FROM journey_stages
            WHERE phase_id = ANY(:phase_ids) AND is_active = TRUE
            ORDER BY stage_order ASC
            """
        ),
        {"phase_ids": phase_ids},
    ).mappings().all()
    grouped: dict[int, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["phase_id"], []).append(dict(row))
    return grouped


def _completed_stage_ids(db: Session, user_id) -> set[int]:
    rows = db.execute(
        text(
            """
            SELECT stage_id
            FROM student_stage_progress
            WHERE user_id = :user_id AND status = 'completed' AND stage_id IS NOT NULL
            """
        ),
        {"user_id": user_id},
    ).all()
    return {row[0] for row in rows}


def get_startup_progress_state(db: Session, user_id) -> dict:
    """Returns the same shape context_builder._build_startup_context used to
    derive from ProjectProgress.current_step/completed_tasks, but computed
    from real per-stage status in student_stage_progress."""
    phases = _active_phases(db)
    stages_by_phase = _active_stages_by_phase(db, [p["id"] for p in phases])
    completed_stage_ids = _completed_stage_ids(db, user_id)

    tasks = [p["phase_name"] for p in phases if str(p.get("phase_name") or "").strip()]
    stage_labels = {int(p["phase_order"]): str(p["phase_name"] or "") for p in phases if p.get("phase_order") is not None}

    completed_tasks: list[str] = []
    current_step = phases[0]["phase_order"] if phases else 1
    found_incomplete = False
    for phase in phases:
        phase_stages = stages_by_phase.get(phase["id"], [])
        phase_complete = bool(phase_stages) and all(s["id"] in completed_stage_ids for s in phase_stages)
        if phase_complete:
            completed_tasks.append(phase["phase_name"])
        elif not found_incomplete:
            current_step = phase["phase_order"]
            found_incomplete = True
    if phases and not found_incomplete:
        # every phase complete - park on the last one
        current_step = phases[-1]["phase_order"]

    current_phase = next((p for p in phases if int(p.get("phase_order") or 0) == current_step), None)
    current_stages = stages_by_phase.get(current_phase["id"], []) if current_phase else []

    return {
        "current_step": current_step,
        "tasks": tasks,
        "completed_tasks": completed_tasks,
        "stage_labels": stage_labels,
        "current_phase": current_phase,
        "current_stages": current_stages,
        "phases": phases,
    }


def mark_stage_complete(
    db: Session,
    user_id,
    *,
    phase_id: int | None = None,
    stage_id: int | None = None,
    phase_order: int | None = None,
    stage_order: int | None = None,
    phase_name: str | None = None,
) -> bool:
    """Upserts a completed student_stage_progress row for one stage, resolved
    either directly by id, by (phase_order, stage_order), or (as a last
    resort, matching the old free-text "complete_task" behavior) by
    phase_name. Returns False if the stage couldn't be resolved."""
    if stage_id is None:
        if phase_id is None and phase_order is not None:
            row = db.execute(
                text("SELECT id FROM journey_phases WHERE phase_order = :phase_order AND is_active = TRUE LIMIT 1"),
                {"phase_order": phase_order},
            ).first()
            phase_id = row[0] if row else None
        if phase_id is None and phase_name:
            row = db.execute(
                text("SELECT id FROM journey_phases WHERE phase_name = :phase_name AND is_active = TRUE LIMIT 1"),
                {"phase_name": phase_name},
            ).first()
            phase_id = row[0] if row else None
        if phase_id is None:
            return False
        if stage_order is not None:
            row = db.execute(
                text(
                    "SELECT id FROM journey_stages WHERE phase_id = :phase_id AND stage_order = :stage_order "
                    "AND is_active = TRUE LIMIT 1"
                ),
                {"phase_id": phase_id, "stage_order": stage_order},
            ).first()
        else:
            # No specific stage given - fall back to the phase's last active stage,
            # matching the old "completing this task/phase" semantics.
            row = db.execute(
                text(
                    "SELECT id FROM journey_stages WHERE phase_id = :phase_id AND is_active = TRUE "
                    "ORDER BY stage_order DESC LIMIT 1"
                ),
                {"phase_id": phase_id},
            ).first()
        stage_id = row[0] if row else None

    if stage_id is None:
        return False

    profile_id = ensure_student_profile(db, user_id)
    now = datetime.now(timezone.utc)

    # Cumulative "what happened so far" summary - idea + this stage's chats
    # and web research, folded on top of the previous stage's summary. See
    # app/services/stage_summary_service.py. Built before the completion row
    # is written so it can still look up the *previous* stage's stage_notes
    # unambiguously (this stage isn't "completed" yet while that runs).
    from app.services.stage_summary_service import build_stage_summary

    stage_notes = build_stage_summary(db, user_id, stage_id)

    existing = (
        db.query(StudentStageProgress)
        .filter(StudentStageProgress.user_id == user_id, StudentStageProgress.stage_id == stage_id)
        .first()
    )
    if existing:
        existing.status = "completed"
        existing.progress_percent = 100
        existing.completed_at = now
        existing.phase_id = phase_id or existing.phase_id
        existing.profile_id = existing.profile_id or profile_id
        existing.stage_notes = stage_notes
        db.add(existing)
    else:
        db.add(
            StudentStageProgress(
                user_id=user_id,
                profile_id=profile_id,
                phase_id=phase_id,
                stage_id=stage_id,
                status="completed",
                progress_percent=100,
                started_at=now,
                completed_at=now,
                stage_notes=stage_notes,
            )
        )
    db.commit()
    return True


@dataclass
class StartupProgressAnchor:
    """Duck-types the subset of ProjectProgress (.project_name, .current_step,
    .completed_tasks) that chat.py reads everywhere, so the startup-journey
    code path doesn't need a project_progress row at all - state is computed
    live from student_stage_progress via get_startup_progress_state()."""

    project_name: str
    current_step: int = 1
    completed_tasks: str = ""
    state: dict = field(default_factory=dict)

    @classmethod
    def build(cls, db: Session, user_id, project_name: str) -> "StartupProgressAnchor":
        state = get_startup_progress_state(db, user_id)
        return cls(
            project_name=project_name,
            current_step=state["current_step"],
            completed_tasks="||".join(state["completed_tasks"]),
            state=state,
        )
