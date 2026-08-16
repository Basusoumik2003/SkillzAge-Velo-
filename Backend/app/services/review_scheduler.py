from __future__ import annotations

import json
import logging
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.database import SessionLocal
from app.services.github_integration_service import GitHubIntegrationService

try:  # APScheduler is optional at import time, but required for production scheduling.
    from apscheduler.schedulers.background import BackgroundScheduler
except Exception:  # pragma: no cover - dependency may not be installed in the dev shell
    BackgroundScheduler = None  # type: ignore[assignment]

logger = logging.getLogger("internlabs-api.github.scheduler")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class ReviewSchedulerHealth:
    enabled: bool
    running: bool
    status: str
    last_execution: str | None = None
    next_execution: str | None = None
    projects_checked: int = 0
    reminders_sent: int = 0
    failures: int = 0
    interval_minutes: int = 60
    inactivity_threshold_days: int = 3
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ReviewScheduler:
    def __init__(
        self,
        *,
        settings: Settings | None = None,
        db_session_factory: Callable[[], Session] = SessionLocal,
    ):
        self.settings = settings or get_settings()
        self.db_session_factory = db_session_factory
        self._lock = threading.RLock()
        self._scheduler = BackgroundScheduler(timezone=timezone.utc) if BackgroundScheduler else None
        self._job_id = "internlabs-review-scheduler"
        self._running = False
        self._last_execution: datetime | None = None
        self._next_execution: datetime | None = None
        self._projects_checked = 0
        self._reminders_sent = 0
        self._failures = 0
        self._last_error: str = ""

    @classmethod
    def from_settings(cls) -> "ReviewScheduler":
        return cls(settings=get_settings(), db_session_factory=SessionLocal)

    def start(self) -> bool:
        if not self.settings.scheduler_enabled:
            logger.info("scheduler_started", extra={"status": "disabled", "enabled": False})
            return False
        if self._scheduler is None:
            logger.warning("scheduler_started", extra={"status": "unavailable", "enabled": True, "reason": "apscheduler_missing"})
            return False
        with self._lock:
            if self._running:
                return True
            interval_minutes = max(1, int(self.settings.scheduler_interval_minutes or 60))
            self._scheduler.add_job(
                self.run_scan,
                trigger="interval",
                minutes=interval_minutes,
                id=self._job_id,
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=max(60, interval_minutes * 60),
            )
            self._scheduler.start()
            self._running = True
            self._next_execution = self._scheduler.get_job(self._job_id).next_run_time if self._scheduler.get_job(self._job_id) else None
        logger.info(
            "scheduler_started",
            extra={
                "status": "running",
                "enabled": True,
                "interval_minutes": int(self.settings.scheduler_interval_minutes or 60),
                "inactivity_threshold_days": int(self.settings.inactivity_threshold_days or 3),
            },
        )
        return True

    def stop(self) -> None:
        scheduler = self._scheduler
        if scheduler is None:
            return
        with self._lock:
            if not self._running:
                return
            scheduler.shutdown(wait=False)
            self._running = False

    def run_scan(self) -> dict[str, Any]:
        started_at = _utcnow()
        checked = 0
        reminders = 0
        failures = 0
        logger.info(
            "scheduler_scan_started",
            extra={
                "started_at": started_at.isoformat(),
                "enabled": bool(self.settings.scheduler_enabled),
                "threshold_days": int(self.settings.inactivity_threshold_days or 3),
            },
        )

        if not self.settings.scheduler_enabled:
            self._update_metrics(executed_at=_utcnow(), checked=0, reminders=0, failures=0)
            return self.health().to_dict()

        if not self.settings.enable_inactivity_reminders:
            self._update_metrics(executed_at=_utcnow(), checked=0, reminders=0, failures=0)
            logger.info(
                "scheduler_scan_completed",
                extra={
                    "status": "disabled",
                    "projects_checked": 0,
                    "reminders_sent": 0,
                    "failures": 0,
                },
            )
            return self.health().to_dict()

        try:
            with self.db_session_factory() as db:
                integration = GitHubIntegrationService(db=db, settings=self.settings)
                rows = self._load_inactivity_candidates(db)
                for row in rows:
                    checked += 1
                    try:
                        if not integration.stage_requires_github(str(row.get("project_name") or ""), int(row.get("step_number") or 0), int(row.get("stage_index") or 0)):
                            continue
                        if not self._is_inactive(row):
                            continue
                        reminder_created = self._create_inactivity_reminder(db, row)
                        if reminder_created:
                            reminders += 1
                    except Exception as exc:  # pragma: no cover - defensive boundary
                        failures += 1
                        logger.exception(
                            "scheduler_project_scan_failed",
                            extra={
                                "repository_id": row.get("repository_id"),
                                "user_id": row.get("user_id"),
                                "project_name": row.get("project_name"),
                                "error": str(exc),
                            },
                        )
                db.commit()
        except Exception as exc:  # pragma: no cover - defensive boundary
            failures += 1
            self._last_error = str(exc)
            logger.exception("scheduler_scan_failed", extra={"error": str(exc)})

        self._update_metrics(executed_at=_utcnow(), checked=checked, reminders=reminders, failures=failures)
        logger.info(
            "scheduler_scan_completed",
            extra={
                "started_at": started_at.isoformat(),
                "completed_at": self._last_execution.isoformat() if self._last_execution else "",
                "projects_checked": checked,
                "reminders_sent": reminders,
                "failures": failures,
                "status": "completed" if failures == 0 else "completed_with_failures",
            },
        )
        return self.health().to_dict()

    def health(self) -> ReviewSchedulerHealth:
        scheduler_job = self._scheduler.get_job(self._job_id) if self._scheduler else None
        next_execution = scheduler_job.next_run_time if scheduler_job else self._next_execution
        return ReviewSchedulerHealth(
            enabled=bool(self.settings.scheduler_enabled),
            running=bool(self._running and self._scheduler),
            status=(
                "running"
                if self._running and self._scheduler
                else "disabled"
                if not self.settings.scheduler_enabled
                else "unavailable"
                if self._scheduler is None
                else "stopped"
            ),
            last_execution=self._last_execution.isoformat() if self._last_execution else None,
            next_execution=next_execution.isoformat() if next_execution else None,
            projects_checked=self._projects_checked,
            reminders_sent=self._reminders_sent,
            failures=self._failures,
            interval_minutes=max(1, int(self.settings.scheduler_interval_minutes or 60)),
            inactivity_threshold_days=max(1, int(self.settings.inactivity_threshold_days or 3)),
            details={
                "last_error": self._last_error,
                "apscheduler_available": bool(self._scheduler),
            },
        )

    def _update_metrics(self, *, executed_at: datetime, checked: int, reminders: int, failures: int) -> None:
        with self._lock:
            self._last_execution = executed_at
            self._projects_checked = checked
            self._reminders_sent = reminders
            self._failures = failures
            scheduler_job = self._scheduler.get_job(self._job_id) if self._scheduler else None
            self._next_execution = scheduler_job.next_run_time if scheduler_job else None

    def _load_inactivity_candidates(self, db: Session) -> list[dict[str, Any]]:
        rows = db.execute(
            text(
                """
                SELECT
                  r.id AS repository_id,
                  r.user_id,
                  r.project_name,
                  r.github_username,
                  r.repository_url,
                  r.branch_name,
                  r.last_commit_hash,
                  r.last_reviewed_commit,
                  r.connection_status,
                  r.webhook_enabled,
                  r.connected_at,
                  s.id AS stage_id,
                  s.step_number,
                  s.stage_index,
                  s.updated_at AS stage_updated_at,
                  COALESCE(ch.commit_hash, r.last_commit_hash, '') AS latest_commit_hash,
                  COALESCE(ch.committed_at, r.connected_at) AS last_commit_at
                FROM github_repositories r
                JOIN LATERAL (
                  SELECT id, step_number, stage_index, updated_at
                  FROM project_stage_progress
                  WHERE user_id = r.user_id
                    AND LOWER(TRIM(project_name)) = LOWER(TRIM(r.project_name))
                    AND status = 'working'
                  ORDER BY updated_at DESC NULLS LAST, id DESC
                  LIMIT 1
                ) s ON TRUE
                LEFT JOIN LATERAL (
                  SELECT commit_hash, committed_at
                  FROM github_commit_history
                  WHERE github_repository_id = r.id
                  ORDER BY committed_at DESC NULLS LAST, id DESC
                  LIMIT 1
                ) ch ON TRUE
                WHERE COALESCE(r.connection_status, '') = 'connected'
                  AND COALESCE(r.repository_url, '') <> ''
                ORDER BY r.connected_at DESC, r.id DESC
                """
            )
        ).mappings().all()
        return [dict(row) for row in rows]

    def _is_inactive(self, row: dict[str, Any]) -> bool:
        threshold_days = max(1, int(self.settings.inactivity_threshold_days or 3))
        threshold = timedelta(days=threshold_days)
        last_commit_at = row.get("last_commit_at") or row.get("connected_at")
        if not isinstance(last_commit_at, datetime):
            return False
        if last_commit_at.tzinfo is None:
            last_commit_at = last_commit_at.replace(tzinfo=timezone.utc)
        return _utcnow() - last_commit_at >= threshold

    def _create_inactivity_reminder(self, db: Session, row: dict[str, Any]) -> bool:
        repository_id = int(row.get("repository_id") or 0)
        user_id = int(row.get("user_id") or 0)
        stage_id = int(row.get("stage_id") or 0)
        latest_commit_hash = str(row.get("latest_commit_hash") or "").strip()
        last_commit_at = row.get("last_commit_at") or row.get("connected_at")
        inactive_for_hours = 0
        if isinstance(last_commit_at, datetime):
            if last_commit_at.tzinfo is None:
                last_commit_at = last_commit_at.replace(tzinfo=timezone.utc)
            inactive_for_hours = int((_utcnow() - last_commit_at).total_seconds() // 3600)

        dedupe_key = f"inactive_reminder:{repository_id}:{latest_commit_hash or 'no-commit'}"
        title = "GitHub activity reminder"
        message = "No new GitHub commits have been detected for 3 days. Please push an update to keep your workspace moving."
        payload = {
            "repository_id": repository_id,
            "user_id": user_id,
            "project_name": row.get("project_name") or "",
            "stage_id": stage_id,
            "step_number": row.get("step_number") or 0,
            "stage_index": row.get("stage_index") or 0,
            "latest_commit_hash": latest_commit_hash,
            "last_commit_at": last_commit_at.isoformat() if isinstance(last_commit_at, datetime) else None,
            "inactive_for_hours": inactive_for_hours,
            "threshold_days": max(1, int(self.settings.inactivity_threshold_days or 3)),
        }

        inserted = db.execute(
            text(
                """
                INSERT INTO notification_history
                  (user_id, github_repository_id, stage_id, notification_type, channel, delivery_status,
                   dedupe_key, title, message, payload, created_at, updated_at)
                VALUES
                  (:user_id, :github_repository_id, :stage_id, 'inactive_reminder', 'in_app', 'queued',
                   :dedupe_key, :title, :message, CAST(:payload AS jsonb), NOW(), NOW())
                ON CONFLICT (dedupe_key) DO NOTHING
                RETURNING id
                """
            ),
            {
                "user_id": user_id,
                "github_repository_id": repository_id,
                "stage_id": stage_id or None,
                "dedupe_key": dedupe_key,
                "title": title,
                "message": message,
                "payload": json.dumps(payload, ensure_ascii=False, default=str),
            },
        ).mappings().first()

        if not inserted:
            return False

        logger.info(
            "project_inactive",
            extra={
                "repository_id": repository_id,
                "user_id": user_id,
                "project_name": row.get("project_name") or "",
                "stage_id": stage_id,
                "latest_commit_hash": latest_commit_hash,
                "inactive_for_hours": inactive_for_hours,
            },
        )
        logger.info(
            "reminder_created",
            extra={
                "repository_id": repository_id,
                "user_id": user_id,
                "stage_id": stage_id,
                "dedupe_key": dedupe_key,
            },
        )
        db.execute(
            text(
                """
                INSERT INTO github_activity_logs
                  (user_id, github_repository_id, stage_id, activity_type, activity_status, source, correlation_id, details, occurred_at, created_at)
                VALUES
                  (:user_id, :repository_id, :stage_id, 'scheduler_reminder_sent', 'success', 'scheduler', :correlation_id,
                   CAST(:details AS jsonb), NOW(), NOW())
                ON CONFLICT DO NOTHING
                """
            ),
            {
                "user_id": user_id,
                "repository_id": repository_id,
                "stage_id": stage_id or None,
                "correlation_id": dedupe_key,
                "details": json.dumps(payload, ensure_ascii=False, default=str),
            },
        )
        db.execute(
            text(
                """
                INSERT INTO github_activity_logs
                  (user_id, github_repository_id, stage_id, activity_type, activity_status, source, correlation_id, details, occurred_at, created_at)
                VALUES
                  (:user_id, :repository_id, :stage_id, 'notification_emitted', 'success', 'scheduler', :correlation_id,
                   CAST(:details AS jsonb), NOW(), NOW())
                ON CONFLICT DO NOTHING
                """
            ),
            {
                "user_id": user_id,
                "repository_id": repository_id,
                "stage_id": stage_id or None,
                "correlation_id": f"{dedupe_key}:notification",
                "details": json.dumps({"notification_type": "inactive_reminder", **payload}, ensure_ascii=False, default=str),
            },
        )
        return True
