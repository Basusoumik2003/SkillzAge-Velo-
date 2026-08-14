from __future__ import annotations

import json
import logging
import re
from contextlib import nullcontext
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.github_models import GitHubRepository
from app.db.models import Project, ProjectProgress, User
from app.services.github_service import (
    GitHubAPIError,
    fetch_branch_head_commit,
    fetch_commit_changed_files,
    fetch_commit_metadata,
    fetch_repository_metadata,
    normalize_repository_url,
    parse_owner_repo,
)
from app.services.github_settings_service import get_effective_github_settings
from app.services.review_job_service import ReviewJobService

logger = logging.getLogger("internlabs-api.github.integration")

ACTIVE_TRIGGER_EVENTS = {
    "stage_entered",
    "stage_resumed",
    "mentor_stage_changed",
    "admin_stage_changed",
    "webhook_push",
    "scheduler_probe",
}

IGNORED_TRIGGER_EVENTS = {
    "stage_exited",
    "stage_paused",
}

VALID_STAGE_STATUSES = {"undone", "working", "completed"}
WEBHOOK_REVIEW_SOURCES = {"webhook"}
STAGE_REVIEW_SOURCES = {"stage_resolver", "scheduler_probe"}


@dataclass(slots=True)
class GitHubIntegrationResult:
    status: str
    message: str = ""
    user_id: int | None = None
    project_name: str = ""
    step_number: int | None = None
    stage_index: int | None = None
    repository_id: int | None = None
    commit_history_id: int | None = None
    review_job_id: int | None = None
    commit_hash: str = ""
    branch_name: str = ""
    notification_type: str = ""
    notification_message: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _json_safe(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        text_value = value.strip()
        if not text_value:
            return default
        try:
            parsed = json.loads(text_value)
        except json.JSONDecodeError:
            return default
        return parsed if isinstance(parsed, type(default)) else default
    return default


def _normalize_status(value: Any, default: str = "undone") -> str:
    status = str(value or default).strip().lower()
    return status if status in VALID_STAGE_STATUSES else default


def _parse_stage_blocks(step_context: str | None) -> list[list[str]]:
    raw = str(step_context or "").strip()
    if not raw:
        return []
    blocks: list[list[str]] = []
    for block in re.split(r"\n\s*\n", raw):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if lines:
            blocks.append(lines)
    return blocks


def _stage_requires_github(step_context: str | None, stage_index: int) -> bool:
    blocks = _parse_stage_blocks(step_context)
    if stage_index < 0 or stage_index >= len(blocks):
        return False

    github_line = next((line for line in blocks[stage_index] if line.lower().startswith("github integration required:")), "")
    if ":" not in github_line:
        return False

    value = github_line.split(":", 1)[1].strip().lower()
    return value in {"yes", "true", "1", "required"}


def _project_steps_from_json(steps_json: Any) -> list[dict[str, Any]]:
    value = _json_safe(steps_json, [])
    if not isinstance(value, list):
        return []
    result: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            result.append(item)
    return result


class GitHubIntegrationService:
    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = get_effective_github_settings(db, settings)
        self.review_job_service = ReviewJobService(db)

    def process_stage_transition(
        self,
        *,
        user_id: int,
        project_name: str,
        step_number: int,
        stage_index: int,
        event_type: str,
        actor: str = "system",
        previous_status: str | None = None,
        current_status: str | None = None,
        source_payload: dict[str, Any] | None = None,
    ) -> GitHubIntegrationResult:
        event = str(event_type or "").strip().lower() or "stage_entered"
        if event in IGNORED_TRIGGER_EVENTS:
            return GitHubIntegrationResult(
                status="ignored",
                message=f"Event '{event}' does not trigger GitHub review operations.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
            )

        if event not in ACTIVE_TRIGGER_EVENTS:
            event = "stage_entered"

        if not bool(getattr(self.settings, "enable_stage_reviews", True)):
            return GitHubIntegrationResult(
                status="disabled",
                message="Stage-triggered GitHub reviews are disabled.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
            )

        stage_row = self._load_stage_row(user_id, project_name, step_number, stage_index)
        if not stage_row:
            return GitHubIntegrationResult(
                status="ignored",
                message="Stage row not found.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
            )

        normalized_status = _normalize_status(stage_row.get("status"))
        if normalized_status == "completed" and event not in {"admin_stage_changed", "mentor_stage_changed"}:
            return GitHubIntegrationResult(
                status="skipped",
                message="Completed stages do not re-trigger GitHub checks.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
            )

        if not self._stage_requires_github(project_name, step_number, stage_index):
            self._record_activity(
                activity_type="stage_entered",
                activity_status="skipped",
                source="stage_resolver",
                user_id=user_id,
                stage_id=int(stage_row["id"]),
                details={
                    "project_name": project_name,
                    "step_number": step_number,
                    "stage_index": stage_index,
                    "reason": "github_not_required",
                    "event_type": event,
                    "previous_status": previous_status,
                    "current_status": current_status,
                    "actor": actor,
                },
                correlation_id=self._stage_correlation_id(user_id, project_name, step_number, stage_index, event, actor),
            )
            return GitHubIntegrationResult(
                status="ignored",
                message="GitHub is not required for this stage.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
            )

        repository = self._load_repository(user_id, project_name)
        if not repository:
            self._record_notification(
                user_id=user_id,
                notification_type="github_connect_required",
                title="Connect GitHub to continue",
                message="GitHub must be connected before code reviews can run in Coding Stage.",
                dedupe_key=self._notification_dedupe_key(user_id, project_name, step_number, stage_index, "connect_required"),
                payload={
                    "project_name": project_name,
                    "step_number": step_number,
                    "stage_index": stage_index,
                    "event_type": event,
                },
            )
            self._record_activity(
                activity_type="stage_entered",
                activity_status="skipped",
                source="stage_resolver",
                user_id=user_id,
                stage_id=int(stage_row["id"]),
                details={
                    "project_name": project_name,
                    "step_number": step_number,
                    "stage_index": stage_index,
                    "reason": "github_not_connected",
                    "event_type": event,
                    "previous_status": previous_status,
                    "current_status": current_status,
                    "actor": actor,
                },
                correlation_id=self._stage_correlation_id(user_id, project_name, step_number, stage_index, event, actor),
            )
            return GitHubIntegrationResult(
                status="needs_connection",
                message="GitHub is not connected for this student.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
                notification_type="github_connect_required",
                notification_message="GitHub must be connected before code reviews can run in Coding Stage.",
                details={"project_name": project_name, "stage_id": int(stage_row["id"])},
            )

        evaluation = self._evaluate_and_enqueue(
            repository=repository,
            stage_row=stage_row,
            user_id=user_id,
            project_name=project_name,
            step_number=step_number,
            stage_index=stage_index,
            review_source="stage_resolver",
            triggered_by="system",
            event_type=event,
            actor=actor,
            correlation_id=self._stage_correlation_id(user_id, project_name, step_number, stage_index, event, actor),
            source_payload=source_payload or {},
        )
        return evaluation

    def process_push_webhook(
        self,
        *,
        payload: dict[str, Any],
        delivery_id: str | None = None,
    ) -> GitHubIntegrationResult:
        if not bool(getattr(self.settings, "enable_webhook_reviews", True)):
            return GitHubIntegrationResult(status="disabled", message="Webhook-triggered GitHub reviews are disabled.")

        repository_url = normalize_repository_url(payload.get("repository", {}).get("html_url", ""))
        if not repository_url:
            return GitHubIntegrationResult(status="ignored", message="Webhook payload did not include a repository URL.")

        ref = str(payload.get("ref", "") or "")
        branch_name = ref.removeprefix("refs/heads/") if ref.startswith("refs/heads/") else ""
        branch_name = branch_name or str(payload.get("repository", {}).get("default_branch") or "main").strip() or "main"
        latest_commit = str(payload.get("after") or payload.get("head_commit", {}).get("id") or "").strip()
        if not latest_commit:
            return GitHubIntegrationResult(status="ignored", message="Webhook payload did not include a commit hash.")

        repositories = self._load_repositories_by_url(repository_url)
        if not repositories:
            return GitHubIntegrationResult(status="ignored", message="No connected repository matches the webhook payload.")

        final_result = GitHubIntegrationResult(status="ignored", message="Webhook received but no review was started.")
        for repository in repositories:
            if self._webhook_delivery_processed(int(repository["id"]), latest_commit, delivery_id):
                self._record_activity(
                    activity_type="webhook_received",
                    activity_status="skipped",
                    source="webhook",
                    user_id=int(repository["user_id"]),
                    repository_id=int(repository["id"]),
                    details={
                        "reason": "duplicate_delivery",
                        "repository_url": repository_url,
                        "branch_name": branch_name,
                        "latest_commit": latest_commit,
                        "delivery_id": delivery_id or "",
                    },
                    correlation_id=self._webhook_correlation_id(delivery_id, repository_url, latest_commit, int(repository["id"])),
                )
                final_result = GitHubIntegrationResult(
                    status="duplicate",
                    message="Duplicate webhook delivery ignored.",
                    user_id=int(repository["user_id"]),
                    repository_id=int(repository["id"]),
                    commit_hash=latest_commit,
                    branch_name=branch_name,
                    details={
                        "reason": "duplicate_delivery",
                        "repository_url": repository_url,
                        "branch_name": branch_name,
                        "latest_commit": latest_commit,
                        "delivery_id": delivery_id or "",
                    },
                )
                continue

            if not bool(repository.get("webhook_enabled", False)):
                self._touch_repository_state(
                    int(repository["id"]),
                    webhook_enabled=True,
                    connection_status="connected",
                    connection_verified_at=_utcnow(),
                    last_pull_at=_utcnow(),
                    last_scheduler_check=_utcnow(),
                )
                self._record_activity(
                    activity_type="webhook_received",
                    activity_status="success",
                    source="webhook",
                    user_id=int(repository["user_id"]),
                    repository_id=int(repository["id"]),
                    details={
                        "reason": "webhook_auto_enabled",
                        "repository_url": repository_url,
                        "branch_name": branch_name,
                        "latest_commit": latest_commit,
                        "delivery_id": delivery_id or "",
                    },
                    correlation_id=self._webhook_correlation_id(delivery_id, repository_url, latest_commit, int(repository["id"])),
                )

            stage_row = self._pick_active_stage(int(repository["user_id"]), repository["project_name_hint"])
            if not stage_row:
                self._record_activity(
                    activity_type="webhook_received",
                    activity_status="skipped",
                    source="webhook",
                    user_id=int(repository["user_id"]),
                    repository_id=int(repository["id"]),
                    details={
                        "reason": "no_active_stage",
                        "repository_url": repository_url,
                        "branch_name": branch_name,
                        "latest_commit": latest_commit,
                        "delivery_id": delivery_id or "",
                    },
                    correlation_id=self._webhook_correlation_id(delivery_id, repository_url, latest_commit, int(repository["id"])),
                )
                continue

            if not self._stage_requires_github(stage_row["project_name"], int(stage_row["step_number"]), int(stage_row["stage_index"])):
                continue

            result = self._evaluate_and_enqueue(
                repository=repository,
                stage_row=stage_row,
                user_id=int(repository["user_id"]),
                project_name=str(stage_row["project_name"]),
                step_number=int(stage_row["step_number"]),
                stage_index=int(stage_row["stage_index"]),
                review_source="webhook",
                triggered_by="webhook",
                event_type="webhook_push",
                actor="webhook",
                correlation_id=self._webhook_correlation_id(delivery_id, repository_url, latest_commit, int(repository["id"])),
                commit_override=latest_commit,
                branch_override=branch_name,
                source_payload=payload,
            )
            if result.status not in {"ignored", "skipped"}:
                final_result = result
        return final_result

    def stage_requires_github(self, project_name: str, step_number: int, stage_index: int) -> bool:
        return self._stage_requires_github(project_name, step_number, stage_index)

    def scheduler_probe(
        self,
        *,
        user_id: int,
        project_name: str | None = None,
    ) -> GitHubIntegrationResult:
        repository = self._load_repository(user_id, project_name)
        if not repository:
            return GitHubIntegrationResult(status="needs_connection", message="No GitHub repository is connected.", user_id=user_id)

        stage_row = self._pick_active_stage(user_id, project_name or repository["project_name_hint"])
        if not stage_row:
            self._touch_repository_scheduler_check(int(repository["id"]))
            return GitHubIntegrationResult(status="skipped", message="No active GitHub-requiring stage found.", user_id=user_id, repository_id=int(repository["id"]))

        return self._evaluate_and_enqueue(
            repository=repository,
            stage_row=stage_row,
            user_id=user_id,
            project_name=str(stage_row["project_name"]),
            step_number=int(stage_row["step_number"]),
            stage_index=int(stage_row["stage_index"]),
            review_source="scheduler",
            triggered_by="scheduler",
            event_type="scheduler_probe",
            actor="scheduler",
            correlation_id=self._stage_correlation_id(user_id, str(stage_row["project_name"]), int(stage_row["step_number"]), int(stage_row["stage_index"]), "scheduler_probe", "scheduler"),
        )

    def _evaluate_and_enqueue(
        self,
        *,
        repository: dict[str, Any],
        stage_row: dict[str, Any],
        user_id: int,
        project_name: str,
        step_number: int,
        stage_index: int,
        review_source: str,
        triggered_by: str,
        event_type: str,
        actor: str,
        correlation_id: str,
        source_payload: dict[str, Any] | None = None,
        commit_override: str | None = None,
        branch_override: str | None = None,
    ) -> GitHubIntegrationResult:
        repo_id = int(repository["id"])
        repository_url = str(repository["repository_url"] or "").strip()
        branch_name = str(branch_override or repository.get("branch_name") or repository.get("default_branch") or "main").strip() or "main"

        if review_source in WEBHOOK_REVIEW_SOURCES and not bool(getattr(self.settings, "enable_webhook_reviews", True)):
            return GitHubIntegrationResult(
                status="disabled",
                message="Webhook-triggered GitHub reviews are disabled.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
                repository_id=repo_id,
                branch_name=branch_name,
            )
        if review_source in STAGE_REVIEW_SOURCES and not bool(getattr(self.settings, "enable_stage_reviews", True)):
            return GitHubIntegrationResult(
                status="disabled",
                message="Stage-triggered GitHub reviews are disabled.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
                repository_id=repo_id,
                branch_name=branch_name,
            )

        connection_result = self._validate_connection(repository)
        if not connection_result["ok"]:
            self._touch_repository_state(repo_id, connection_status=connection_result["connection_status"], last_scheduler_check=_utcnow())
            self._record_activity(
                activity_type="repo_checked",
                activity_status="failure",
                source=review_source,
                user_id=user_id,
                repository_id=repo_id,
                stage_id=int(stage_row["id"]),
                details=connection_result,
                correlation_id=correlation_id,
            )
            if connection_result.get("notification_type"):
                self._record_notification(
                    user_id=user_id,
                    notification_type=str(connection_result["notification_type"]),
                    title=str(connection_result.get("notification_title") or "GitHub attention required"),
                    message=str(connection_result.get("notification_message") or connection_result["message"]),
                    dedupe_key=self._notification_dedupe_key(user_id, project_name, step_number, stage_index, str(connection_result["notification_type"])),
                    payload={
                        "repository_id": repo_id,
                        "project_name": project_name,
                        "step_number": step_number,
                        "stage_index": stage_index,
                        "event_type": event_type,
                        "actor": actor,
                        **connection_result,
                    },
                )
            return GitHubIntegrationResult(
                status=str(connection_result["status"]),
                message=str(connection_result["message"]),
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
                repository_id=repo_id,
                branch_name=branch_name,
                notification_type=str(connection_result.get("notification_type") or ""),
                notification_message=str(connection_result.get("notification_message") or ""),
                details=connection_result,
            )

        repo_meta = self._validate_repository(repository_url)
        resolved_branch = str(branch_name or repo_meta.get("default_branch") or "main").strip() or "main"
        branch_result = self._validate_branch(repository_url, resolved_branch, repo_meta.get("default_branch") or "main")
        if not branch_result["ok"]:
            self._touch_repository_state(repo_id, connection_status=branch_result["connection_status"], last_scheduler_check=_utcnow())
            self._record_activity(
                activity_type="repo_checked",
                activity_status="failure",
                source=review_source,
                user_id=user_id,
                repository_id=repo_id,
                stage_id=int(stage_row["id"]),
                details=branch_result,
                correlation_id=correlation_id,
            )
            return GitHubIntegrationResult(
                status=str(branch_result["status"]),
                message=str(branch_result["message"]),
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
                repository_id=repo_id,
                branch_name=resolved_branch,
                details=branch_result,
            )

        branch_name = str(branch_result["branch_name"] or resolved_branch or "main")
        latest_commit = str(commit_override or branch_result["latest_commit"] or "").strip()
        if not latest_commit:
            latest_commit = self._fetch_branch_head(repository_url, branch_name)
        if not latest_commit:
            self._touch_repository_state(repo_id, last_scheduler_check=_utcnow())
            return GitHubIntegrationResult(
                status="no_commits",
                message="No commits were found on the configured branch.",
                user_id=user_id,
                project_name=project_name,
                step_number=step_number,
                stage_index=stage_index,
                repository_id=repo_id,
                branch_name=branch_name,
            )

        commit_metadata = self._fetch_commit_metadata(repository_url, latest_commit)
        comparison = self._compare_commits(repository, latest_commit)
        with self._transaction():
            self._touch_repository_state(
                repo_id,
                connection_status="connected",
                default_branch=branch_result.get("default_branch") or repo_meta.get("default_branch") or branch_name,
                branch_name=branch_name,
                last_commit_hash=latest_commit,
                last_pull_at=_utcnow(),
                last_scheduler_check=_utcnow(),
                connection_verified_at=_utcnow(),
                webhook_enabled=bool(repository.get("webhook_enabled", False)),
            )
            self._record_activity(
                activity_type="commit_compared",
                activity_status="success" if comparison["is_new"] else "skipped",
                source=review_source,
                user_id=user_id,
                repository_id=repo_id,
                stage_id=int(stage_row["id"]),
                details={
                    "latest_commit": latest_commit,
                    "last_reviewed_commit": repository.get("last_reviewed_commit") or "",
                    "last_commit_hash": repository.get("last_commit_hash") or "",
                    **comparison,
                },
                correlation_id=correlation_id,
            )

            if not comparison["is_new"]:
                logger.info(
                    "review_skipped_same_commit",
                    extra={
                        "repository_id": repo_id,
                        "user_id": user_id,
                        "project_name": project_name,
                        "commit_hash": latest_commit,
                        "last_reviewed_commit": repository.get("last_reviewed_commit") or "",
                        "review_source": review_source,
                        "correlation_id": correlation_id,
                    },
                )
                return GitHubIntegrationResult(
                    status="up_to_date",
                    message="Latest commit has already been reviewed.",
                    user_id=user_id,
                    project_name=project_name,
                    step_number=step_number,
                    stage_index=stage_index,
                    repository_id=repo_id,
                    commit_hash=latest_commit,
                    branch_name=branch_name,
                    details=comparison,
                )

            commit_history_id = self._upsert_commit_history(
                repository_id=repo_id,
                branch_name=branch_name,
                commit_hash=latest_commit,
                metadata=commit_metadata,
            )
            review_job_result = self.review_job_service.create_review_job(
                user_id=user_id,
                repository_id=repo_id,
                commit_history_id=commit_history_id,
                stage_id=int(stage_row["id"]),
                commit_hash=latest_commit,
                branch_name=branch_name,
                review_source=review_source,
                triggered_by=triggered_by,
                actor=actor,
                event_type=event_type,
                correlation_id=correlation_id,
                project_name=project_name,
                source_payload=source_payload or {},
                commit_metadata=commit_metadata,
            )
            review_job_id = review_job_result.job_id
            logger.info(
                "review_created",
                extra={
                    "review_job_id": review_job_id,
                    "repository_id": repo_id,
                    "user_id": user_id,
                    "project_name": project_name,
                    "stage_id": int(stage_row["id"]),
                    "commit_hash": latest_commit,
                    "review_source": review_source,
                    "triggered_by": triggered_by,
                    "event_type": event_type,
                    "dispatch_status": review_job_result.queue_submission.get("status", ""),
                },
            )
            self._record_activity(
                activity_type="review_job_created",
                activity_status="success",
                source=review_source,
                user_id=user_id,
                repository_id=repo_id,
                commit_history_id=commit_history_id,
                review_job_id=review_job_id,
                stage_id=int(stage_row["id"]),
                details={
                    "branch_name": branch_name,
                    "commit_hash": latest_commit,
                    "review_source": review_source,
                    "triggered_by": triggered_by,
                    "event_type": event_type,
                    "actor": actor,
                    "review_job": review_job_result.to_dict(),
                },
                correlation_id=correlation_id,
            )

        return GitHubIntegrationResult(
            status="review_job_created",
            message="Review job created and queued for asynchronous processing.",
            user_id=user_id,
            project_name=project_name,
            step_number=step_number,
            stage_index=stage_index,
            repository_id=repo_id,
            commit_history_id=commit_history_id,
            review_job_id=review_job_id,
            commit_hash=latest_commit,
            branch_name=branch_name,
            details={
                "review_source": review_source,
                "triggered_by": triggered_by,
                "comparison": comparison,
                "commit_metadata": {
                    "sha": commit_metadata.get("sha", latest_commit),
                    "parent_shas": commit_metadata.get("parent_shas", []),
                    "stats": commit_metadata.get("stats", {}),
                },
                "review_job": review_job_result.to_dict(),
            },
        )

    def _validate_connection(self, repository: dict[str, Any]) -> dict[str, Any]:
        repository_url = str(repository.get("repository_url") or "").strip()
        if not repository_url:
            return {
                "ok": False,
                "status": "needs_connection",
                "connection_status": "disconnected",
                "message": "GitHub is not connected.",
                "notification_type": "github_connect_required",
                "notification_title": "Connect GitHub to continue",
                "notification_message": "Code reviews can only be performed with a connected GitHub repository.",
            }

        token_row = self._load_github_app_settings()
        token_expires_at = token_row.get("token_expires_at")
        if token_expires_at and token_expires_at <= _utcnow():
            return {
                "ok": False,
                "status": "invalid_token",
                "connection_status": "revoked",
                "message": "GitHub token has expired.",
                "notification_type": "github_connect_required",
                "notification_title": "Reconnect GitHub",
                "notification_message": "The GitHub connection token has expired or been revoked.",
            }

        try:
            repo_meta = fetch_repository_metadata(self.settings, repository_url)
        except GitHubAPIError as exc:
            if exc.status_code in {401, 403}:
                return {
                    "ok": False,
                    "status": "invalid_token",
                    "connection_status": "revoked",
                    "message": "GitHub authorization is no longer valid.",
                    "notification_type": "github_connect_required",
                    "notification_title": "Reconnect GitHub",
                    "notification_message": "GitHub authorization has been revoked or expired.",
                    "github_status_code": exc.status_code,
                }
            if exc.status_code == 404:
                return {
                    "ok": False,
                    "status": "repository_deleted",
                    "connection_status": "invalid_repository",
                    "message": "GitHub repository could not be found.",
                    "notification_type": "github_connect_required",
                    "notification_title": "Repository not found",
                    "notification_message": "The connected GitHub repository no longer exists or was moved.",
                    "github_status_code": exc.status_code,
                }
            raise
        return {
            "ok": True,
            "status": "connected",
            "connection_status": "connected",
            "repo_meta": repo_meta,
            "message": "GitHub connection validated.",
        }

    def _validate_repository(self, repository_url: str) -> dict[str, Any]:
        try:
            repo_meta = fetch_repository_metadata(self.settings, repository_url)
        except GitHubAPIError as exc:
            if exc.status_code == 404:
                return {
                    "ok": False,
                    "status": "repository_deleted",
                    "connection_status": "invalid_repository",
                    "message": "Repository was deleted, transferred, or is no longer accessible.",
                }
            if exc.status_code in {401, 403}:
                return {
                    "ok": False,
                    "status": "invalid_token",
                    "connection_status": "revoked",
                    "message": "GitHub authorization is invalid.",
                }
            raise
        default_branch = str(repo_meta.get("default_branch") or "main").strip() or "main"
        if default_branch != "main":
            repo_meta["default_branch"] = default_branch
        return {"ok": True, "status": "validated", "connection_status": "connected", "default_branch": default_branch, "repo_meta": repo_meta}

    def _validate_branch(self, repository_url: str, branch_name: str, default_branch: str) -> dict[str, Any]:
        candidates = [branch_name]
        if default_branch and default_branch not in candidates:
            candidates.append(default_branch)

        last_error: dict[str, Any] | None = None
        for candidate in candidates:
            try:
                latest_commit = fetch_branch_head_commit(self.settings, repository_url, candidate)
            except GitHubAPIError as exc:
                if exc.status_code == 404:
                    last_error = {
                        "ok": False,
                        "status": "branch_deleted",
                        "connection_status": "invalid_branch",
                        "message": f"Configured branch '{candidate}' could not be found.",
                        "branch_name": candidate,
                    }
                    continue
                if exc.status_code in {401, 403}:
                    return {
                        "ok": False,
                        "status": "invalid_token",
                        "connection_status": "revoked",
                        "message": "GitHub authorization is invalid.",
                        "branch_name": candidate,
                    }
                raise

            resolved_branch = candidate
            return {
                "ok": True,
                "status": "validated",
                "connection_status": "connected",
                "branch_name": resolved_branch,
                "latest_commit": latest_commit,
                "default_branch": default_branch or resolved_branch,
            }

        return last_error or {
            "ok": False,
            "status": "branch_deleted",
            "connection_status": "invalid_branch",
            "message": "Configured branch could not be validated.",
        }

    def _compare_commits(self, repository: dict[str, Any], latest_commit: str) -> dict[str, Any]:
        last_reviewed_commit = str(repository.get("last_reviewed_commit") or "").strip()
        last_commit_hash = str(repository.get("last_commit_hash") or "").strip()
        is_new = latest_commit != last_reviewed_commit
        history_rewritten = False
        commit_metadata: dict[str, Any] = {}

        if is_new:
            try:
                commit_metadata = fetch_commit_metadata(self.settings, str(repository.get("repository_url") or ""), latest_commit)
            except GitHubAPIError as exc:
                if exc.status_code in {401, 403}:
                    return {
                        "is_new": False,
                        "history_rewritten": False,
                        "status": "invalid_token",
                        "message": "GitHub authorization is invalid.",
                        "last_reviewed_commit": last_reviewed_commit,
                        "last_commit_hash": last_commit_hash,
                    }
                raise
            parent_shas = [str(item or "").strip() for item in commit_metadata.get("parent_shas", []) if str(item or "").strip()]
            if last_reviewed_commit and last_reviewed_commit not in parent_shas and latest_commit != last_reviewed_commit:
                history_rewritten = True

        return {
            "is_new": is_new,
            "history_rewritten": history_rewritten,
            "status": "new_commit" if is_new else "duplicate_review",
            "message": "New commit detected." if is_new else "Latest commit already reviewed.",
            "last_reviewed_commit": last_reviewed_commit,
            "last_commit_hash": last_commit_hash,
            "commit_metadata": commit_metadata,
        }

    def _upsert_commit_history(
        self,
        *,
        repository_id: int,
        branch_name: str,
        commit_hash: str,
        metadata: dict[str, Any],
    ) -> int:
        committed_at_raw = str(metadata.get("committed_at") or "").strip()
        if not committed_at_raw:
            committed_at_raw = _utcnow().isoformat()

        query = text(
            """
            INSERT INTO github_commit_history
              (github_repository_id, commit_hash, parent_commit_hash, branch_name, commit_message,
               author_name, author_email, committer_name, committer_email, commit_url,
               changed_files, commit_payload, committed_at, pushed_at, created_at)
            VALUES
              (:repository_id, :commit_hash, :parent_commit_hash, :branch_name, :commit_message,
               :author_name, :author_email, :committer_name, :committer_email, :commit_url,
               CAST(:changed_files AS jsonb), CAST(:commit_payload AS jsonb), CAST(:committed_at AS timestamptz), NOW(), NOW())
            ON CONFLICT (github_repository_id, commit_hash)
            DO UPDATE SET
              parent_commit_hash = EXCLUDED.parent_commit_hash,
              branch_name = EXCLUDED.branch_name,
              commit_message = EXCLUDED.commit_message,
              author_name = EXCLUDED.author_name,
              author_email = EXCLUDED.author_email,
              committer_name = EXCLUDED.committer_name,
              committer_email = EXCLUDED.committer_email,
              commit_url = EXCLUDED.commit_url,
              changed_files = EXCLUDED.changed_files,
              commit_payload = EXCLUDED.commit_payload,
              committed_at = EXCLUDED.committed_at,
              pushed_at = NOW()
            RETURNING id
            """
        )
        changed_files = self._normalize_changed_files(metadata.get("files", []))
        parent_shas = [str(item or "").strip() for item in metadata.get("parent_shas", []) if str(item or "").strip()]
        parent_commit_hash = parent_shas[0] if parent_shas else ""
        with self._transaction():
            row = self.db.execute(
                query,
                {
                    "repository_id": repository_id,
                    "commit_hash": commit_hash,
                    "parent_commit_hash": parent_commit_hash,
                    "branch_name": branch_name,
                    "commit_message": str(metadata.get("commit_message") or ""),
                    "author_name": str(metadata.get("author_name") or ""),
                    "author_email": str(metadata.get("author_email") or ""),
                    "committer_name": str(metadata.get("committer_name") or ""),
                    "committer_email": str(metadata.get("committer_email") or ""),
                    "commit_url": str(metadata.get("html_url") or ""),
                    "changed_files": json.dumps(changed_files),
                    "commit_payload": json.dumps(metadata.get("raw") or {}),
                    "committed_at": committed_at_raw,
                },
            ).mappings().first()
        return int(row["id"]) if row and row.get("id") else 0

    def _normalize_changed_files(self, files: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for item in files or []:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "filename": str(item.get("filename") or ""),
                    "status": str(item.get("status") or "modified"),
                    "additions": int(item.get("additions") or 0),
                    "deletions": int(item.get("deletions") or 0),
                    "changes": int(item.get("changes") or 0),
                    "patch": str(item.get("patch") or "")[:4000],
                }
            )
        return normalized

    def _record_activity(
        self,
        *,
        activity_type: str,
        activity_status: str,
        source: str,
        correlation_id: str,
        details: dict[str, Any],
        user_id: int | None = None,
        repository_id: int | None = None,
        commit_history_id: int | None = None,
        review_job_id: int | None = None,
        stage_id: int | None = None,
    ) -> None:
        with self._transaction():
            self.db.execute(
                text(
                    """
                    INSERT INTO github_activity_logs
                      (user_id, github_repository_id, github_commit_history_id, github_review_job_id, stage_id,
                       activity_type, activity_status, source, correlation_id, details, occurred_at, created_at)
                    VALUES
                      (:user_id, :repository_id, :commit_history_id, :review_job_id, :stage_id,
                       :activity_type, :activity_status, :source, :correlation_id, CAST(:details AS jsonb), NOW(), NOW())
                    ON CONFLICT DO NOTHING
                    """
                ),
                {
                    "user_id": user_id,
                    "repository_id": repository_id,
                    "commit_history_id": commit_history_id,
                    "review_job_id": review_job_id,
                    "stage_id": stage_id,
                    "activity_type": activity_type,
                    "activity_status": activity_status,
                    "source": source,
                    "correlation_id": correlation_id or "",
                    "details": json.dumps(details or {}),
                },
            )

    def _record_notification(
        self,
        *,
        user_id: int,
        notification_type: str,
        title: str,
        message: str,
        dedupe_key: str,
        payload: dict[str, Any],
    ) -> None:
        with self._transaction():
            self.db.execute(
                text(
                    """
                    INSERT INTO notification_history
                      (user_id, notification_type, channel, delivery_status, dedupe_key, title, message, payload,
                       created_at, updated_at)
                    VALUES
                      (:user_id, :notification_type, 'in_app', 'queued', :dedupe_key, :title, :message,
                       CAST(:payload AS jsonb), NOW(), NOW())
                    ON CONFLICT DO NOTHING
                    """
                ),
                {
                    "user_id": user_id,
                    "notification_type": notification_type,
                    "dedupe_key": dedupe_key,
                    "title": title,
                    "message": message,
                    "payload": json.dumps(payload or {}),
                },
            )

    def _touch_repository_state(
        self,
        repository_id: int,
        *,
        connection_status: str | None = None,
        default_branch: str | None = None,
        branch_name: str | None = None,
        last_commit_hash: str | None = None,
        last_pull_at: datetime | None = None,
        last_scheduler_check: datetime | None = None,
        connection_verified_at: datetime | None = None,
        webhook_enabled: bool | None = None,
    ) -> None:
        assignments: list[str] = []
        params: dict[str, Any] = {"repository_id": repository_id}
        if connection_status is not None:
            assignments.append("connection_status = :connection_status")
            params["connection_status"] = connection_status
        if default_branch is not None:
            assignments.append("default_branch = :default_branch")
            params["default_branch"] = default_branch
        if branch_name is not None:
            assignments.append("branch_name = :branch_name")
            params["branch_name"] = branch_name
        if last_commit_hash is not None:
            assignments.append("last_commit_hash = :last_commit_hash")
            params["last_commit_hash"] = last_commit_hash
        if last_pull_at is not None:
            assignments.append("last_pull_at = :last_pull_at")
            params["last_pull_at"] = last_pull_at
        if last_scheduler_check is not None:
            assignments.append("last_scheduler_check = :last_scheduler_check")
            params["last_scheduler_check"] = last_scheduler_check
        if connection_verified_at is not None:
            assignments.append("connection_verified_at = :connection_verified_at")
            params["connection_verified_at"] = connection_verified_at
        if webhook_enabled is not None:
            assignments.append("webhook_enabled = :webhook_enabled")
            params["webhook_enabled"] = webhook_enabled
        if not assignments:
            return
        query = text(f"UPDATE github_repositories SET {', '.join(assignments)} WHERE id = :repository_id")
        with self._transaction():
            self.db.execute(query, params)

    def _touch_repository_scheduler_check(self, repository_id: int) -> None:
        self._touch_repository_state(repository_id, last_scheduler_check=_utcnow())

    def _transaction(self):
        return self.db.begin() if not self.db.in_transaction() else nullcontext()

    def _stage_correlation_id(
        self,
        user_id: int,
        project_name: str,
        step_number: int,
        stage_index: int,
        event_type: str,
        actor: str,
    ) -> str:
        normalized_project = re.sub(r"\s+", "-", str(project_name or "").strip().lower()) or "project"
        return f"stage:{user_id}:{normalized_project}:step-{step_number}:stage-{stage_index}:{event_type}:{actor}"

    def _webhook_correlation_id(self, delivery_id: str | None, repository_url: str, commit_hash: str, repository_id: int) -> str:
        delivery = str(delivery_id or "").strip()
        if delivery:
            return f"webhook:{delivery}"
        safe_repo = re.sub(r"[^a-z0-9]+", "-", repository_url.lower()).strip("-")
        return f"webhook:{repository_id}:{safe_repo}:{commit_hash}"

    def _webhook_delivery_processed(self, repository_id: int, commit_hash: str, delivery_id: str | None) -> bool:
        params: dict[str, Any] = {
            "repository_id": repository_id,
            "commit_hash": str(commit_hash or "").strip(),
            "delivery_id": str(delivery_id or "").strip(),
        }
        query = """
            SELECT 1
            FROM github_activity_logs
            WHERE github_repository_id = :repository_id
              AND activity_type = 'webhook_received'
              AND COALESCE(details->>'latest_commit', '') = :commit_hash
        """
        if params["delivery_id"]:
            query += " AND COALESCE(details->>'delivery_id', '') = :delivery_id"
        row = self.db.execute(text(query + " ORDER BY occurred_at DESC LIMIT 1"), params).mappings().first()
        return bool(row)

    def _notification_dedupe_key(
        self,
        user_id: int,
        project_name: str,
        step_number: int,
        stage_index: int,
        suffix: str,
    ) -> str:
        normalized_project = re.sub(r"\s+", "-", str(project_name or "").strip().lower()) or "project"
        return f"{user_id}:{normalized_project}:{step_number}:{stage_index}:{suffix}"

    def _load_repository(self, user_id: int, project_name: str | None = None) -> dict[str, Any] | None:
        params: dict[str, Any] = {"user_id": user_id, "project_name": str(project_name or "").strip()}
        if project_name:
            row = self.db.execute(
                text(
                    """
                    SELECT
                      id, user_id, project_name, github_username, repository_url, branch_name, last_commit_hash, last_reviewed_commit,
                      last_pull_at, last_scheduler_check, webhook_enabled, default_branch, connection_status,
                      connection_verified_at, connected_at
                    FROM github_repositories
                    WHERE user_id = :user_id
                      AND LOWER(TRIM(project_name)) = LOWER(TRIM(:project_name))
                    ORDER BY id DESC
                    LIMIT 1
                    """
                ),
                params,
            ).mappings().first()
            if row:
                result = dict(row)
                result["project_name_hint"] = result.get("project_name") or self._project_name_hint(user_id)
                return result

            legacy_row = self.db.execute(
                text(
                    """
                    SELECT
                      id, user_id, project_name, github_username, repository_url, branch_name, last_commit_hash, last_reviewed_commit,
                      last_pull_at, last_scheduler_check, webhook_enabled, default_branch, connection_status,
                      connection_verified_at, connected_at
                    FROM github_repositories
                    WHERE user_id = :user_id
                      AND (project_name IS NULL OR btrim(project_name) = '')
                    ORDER BY id DESC
                    LIMIT 1
                    """
                ),
                {"user_id": user_id},
            ).mappings().first()
            if legacy_row:
                result = dict(legacy_row)
                result["project_name_hint"] = result.get("project_name") or self._project_name_hint(user_id)
                return result
            return None

        row = self.db.execute(
            text(
                """
                SELECT
                  id, user_id, project_name, github_username, repository_url, branch_name, last_commit_hash, last_reviewed_commit,
                  last_pull_at, last_scheduler_check, webhook_enabled, default_branch, connection_status,
                  connection_verified_at, connected_at
                FROM github_repositories
                WHERE user_id = :user_id
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"user_id": user_id},
        ).mappings().first()
        if row:
            result = dict(row)
            result["project_name_hint"] = result.get("project_name") or self._project_name_hint(user_id)
            return result
        return None

    def _load_repositories_by_url(self, repository_url: str) -> list[dict[str, Any]]:
        rows = self.db.execute(
            text(
                """
                SELECT
                  id, user_id, project_name, github_username, repository_url, branch_name, last_commit_hash, last_reviewed_commit,
                  last_pull_at, last_scheduler_check, webhook_enabled, default_branch, connection_status,
                  connection_verified_at, connected_at
                FROM github_repositories
                WHERE LOWER(TRIM(repository_url)) = LOWER(TRIM(:repository_url))
                ORDER BY id DESC
                """
            ),
            {"repository_url": repository_url},
        ).mappings().all()
        repositories = [dict(row) for row in rows]
        for repository in repositories:
            repository["project_name_hint"] = repository.get("project_name") or self._project_name_hint(int(repository["user_id"]))
        return repositories

    def _load_stage_row(self, user_id: int, project_name: str, step_number: int, stage_index: int) -> dict[str, Any] | None:
        row = self.db.execute(
            text(
                """
                SELECT id, user_id, project_name, step_number, stage_index, status, started_at, completed_at,
                       document_review_status, document_required, updated_at
                FROM project_stage_progress
                WHERE user_id = :user_id
                  AND LOWER(TRIM(project_name)) = LOWER(TRIM(:project_name))
                  AND step_number = :step_number
                  AND stage_index = :stage_index
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {
                "user_id": user_id,
                "project_name": project_name,
                "step_number": step_number,
                "stage_index": stage_index,
            },
        ).mappings().first()
        return dict(row) if row else None

    def _pick_active_stage(self, user_id: int, project_name: str | None = None) -> dict[str, Any] | None:
        params: dict[str, Any] = {"user_id": user_id}
        query = """
                SELECT id, user_id, project_name, step_number, stage_index, status, started_at, completed_at,
                       document_review_status, document_required, updated_at
                FROM project_stage_progress
                WHERE user_id = :user_id
                  AND status = 'working'
        """
        if project_name:
            query += " AND LOWER(TRIM(project_name)) = LOWER(TRIM(:project_name))"
            params["project_name"] = project_name
        query += " ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1"
        row = self.db.execute(text(query), params).mappings().first()
        return dict(row) if row else None

    def _stage_requires_github(self, project_name: str, step_number: int, stage_index: int) -> bool:
        project = (
            self.db.query(Project)
            .filter(Project.title.ilike(project_name.strip()))
            .first()
        )
        steps = _project_steps_from_json(project.steps_json if project else [])
        if step_number < 1 or step_number > len(steps):
            return False
        step = steps[step_number - 1] or {}
        step_context = step.get("step_context") if isinstance(step, dict) else ""
        return _stage_requires_github(step_context, stage_index)

    def _project_name_hint(self, user_id: int) -> str:
        row = self.db.execute(
            text(
                """
                SELECT project_name
                FROM project_progress
                WHERE user_id = :user_id
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"user_id": user_id},
        ).mappings().first()
        return str(row["project_name"]) if row and row.get("project_name") else ""

    def _load_github_app_settings(self) -> dict[str, Any]:
        row = self.db.execute(
            text(
                """
                SELECT github_token, webhook_secret, token_expires_at, is_active
                FROM github_app_settings
                WHERE is_active IS TRUE
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
                """
            )
        ).mappings().first()
        return dict(row) if row else {}

    def _fetch_branch_head(self, repository_url: str, branch_name: str) -> str:
        try:
            return fetch_branch_head_commit(self.settings, repository_url, branch_name)
        except GitHubAPIError as exc:
            if exc.status_code == 404:
                return ""
            raise

    def _fetch_commit_metadata(self, repository_url: str, commit_hash: str) -> dict[str, Any]:
        try:
            return fetch_commit_metadata(self.settings, repository_url, commit_hash)
        except GitHubAPIError as exc:
            if exc.status_code in {401, 403}:
                raise
            if exc.status_code == 404:
                return {}
            raise


def process_stage_transition(
    db: Session,
    settings: Settings,
    *,
    user_id: int,
    project_name: str,
    step_number: int,
    stage_index: int,
    event_type: str,
    actor: str = "system",
    previous_status: str | None = None,
    current_status: str | None = None,
    source_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    service = GitHubIntegrationService(db=db, settings=settings)
    return service.process_stage_transition(
        user_id=user_id,
        project_name=project_name,
        step_number=step_number,
        stage_index=stage_index,
        event_type=event_type,
        actor=actor,
        previous_status=previous_status,
        current_status=current_status,
        source_payload=source_payload,
    ).to_dict()


def process_push_webhook(
    db: Session,
    settings: Settings,
    payload: dict[str, Any],
    delivery_id: str | None = None,
) -> dict[str, Any]:
    service = GitHubIntegrationService(db=db, settings=settings)
    return service.process_push_webhook(payload=payload, delivery_id=delivery_id).to_dict()


def scheduler_probe(
    db: Session,
    settings: Settings,
    *,
    user_id: int,
    project_name: str | None = None,
) -> dict[str, Any]:
    service = GitHubIntegrationService(db=db, settings=settings)
    return service.scheduler_probe(user_id=user_id, project_name=project_name).to_dict()
