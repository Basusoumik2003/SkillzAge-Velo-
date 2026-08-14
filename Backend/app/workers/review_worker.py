from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.core.aws_client import create_sqs_client
from app.core.config import Settings, get_settings
from app.core.queue_config import QueueConfig
from app.core.queue_exceptions import (
    QueueConfigurationException,
    QueueDispatchException,
    QueueUnavailableException,
    QueueValidationException,
)
from app.db.database import SessionLocal
from app.services.diff_builder import DiffBuilder
from app.services.llm_client import LLMRequest, create_llm_client
from app.services.policy_engine import PolicyEngine
from app.services.prompt_builder import PromptBuilder
from app.services.repository_loader import RepositoryLoader
from app.services.review_context_builder import ReviewContextBuilder
from app.services.review_parser import ReviewParser
from app.services.review_persistence import ReviewPersistence
from app.services.score_calculator import ScoreCalculator
from app.workers.worker_health import WorkerHealthMonitor, WorkerHealthSnapshot

logger = logging.getLogger("internlabs-api.review.worker")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class ReviewJobMessage:
    review_job_id: int
    repository_id: int
    project_id: int
    user_id: int
    stage_id: int
    commit_hash: str
    trigger_source: str
    review_source: str
    priority: int
    retry_count: int
    created_at: str
    correlation_id: str
    trace_id: str
    schema_version: int
    branch_name: str = "main"
    queue_name: str = ""
    job_status: str = ""
    source_payload: dict[str, Any] = field(default_factory=dict)
    commit_metadata: dict[str, Any] = field(default_factory=dict)
    job_metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class VisibilityHeartbeat:
    def __init__(self, client: Any, queue_url: str, receipt_handle: str, timeout_seconds: int):
        self.client = client
        self.queue_url = queue_url
        self.receipt_handle = receipt_handle
        self.timeout_seconds = max(5, int(timeout_seconds))
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, name="review-worker-visibility", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread.is_alive():
            self._thread.join(timeout=2)

    def _run(self) -> None:
        interval = max(10, self.timeout_seconds // 2)
        while not self._stop_event.wait(interval):
            try:
                self.client.change_message_visibility(
                    QueueUrl=self.queue_url,
                    ReceiptHandle=self.receipt_handle,
                    VisibilityTimeout=self.timeout_seconds,
                )
            except Exception:
                logger.warning("review_worker_visibility_extension_failed", exc_info=True)


class ReviewWorker:
    def __init__(self, settings: Settings | None = None, worker_id: str | None = None):
        self.settings = settings or get_settings()
        self.queue_config = QueueConfig.from_settings(self.settings, validate=True)
        self.worker_id = worker_id or f"review-worker-{uuid.uuid4().hex[:8]}"
        self.monitor = WorkerHealthMonitor(self.worker_id)
        self._stop_event = threading.Event()
        self._sqs_client = create_sqs_client(self.queue_config)
        self._repository_loader = RepositoryLoader(self.settings)
        self._diff_builder = DiffBuilder()
        self._context_builder = ReviewContextBuilder()
        self._prompt_builder = PromptBuilder()
        self._llm_client = create_llm_client(self.settings)
        self._review_parser = ReviewParser()
        self._policy_engine = PolicyEngine()
        self._score_calculator = ScoreCalculator()

    def stop(self) -> None:
        self._stop_event.set()

    def run_forever(self) -> None:
        logger.info("review_worker_started", extra={"worker_id": self.worker_id})
        while not self._stop_event.is_set():
            try:
                processed = self.run_once()
            except Exception:
                logger.exception("review_worker_loop_crashed", extra={"worker_id": self.worker_id})
                time.sleep(5.0)
                continue

            if not processed:
                time.sleep(1.0)
        logger.info("review_worker_stopped", extra={"worker_id": self.worker_id})

    def run_once(self) -> bool:
        try:
            messages = self._receive_messages()
        except QueueUnavailableException as exc:
            logger.warning(
                "review_worker_queue_unavailable",
                extra={"worker_id": self.worker_id, "error": str(exc)},
                exc_info=True,
            )
            self.monitor.heartbeat()
            return False
        if not messages:
            self.monitor.heartbeat()
            return False

        for message in messages:
            self._process_message(message)
        self.monitor.heartbeat()
        return True

    def health(self) -> WorkerHealthSnapshot:
        return self.monitor.snapshot()

    def _receive_messages(self) -> list[dict[str, Any]]:
        try:
            response = self._sqs_client.receive_message(
                QueueUrl=self.queue_config.review_queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=self.queue_config.long_poll_seconds,
                VisibilityTimeout=self.queue_config.visibility_timeout_seconds,
                AttributeNames=["All"],
                MessageAttributeNames=["All"],
            )
        except Exception as exc:
            raise QueueUnavailableException(str(exc)) from exc
        return response.get("Messages", []) or []

    def _process_message(self, message: dict[str, Any]) -> None:
        receipt_handle = str(message.get("ReceiptHandle") or "")
        body_raw = str(message.get("Body") or "")
        approx_receive_count = int((message.get("Attributes") or {}).get("ApproximateReceiveCount") or 1)
        queue_message = self._deserialize_message(body_raw)
        job_context = self._load_job_context(queue_message.review_job_id)

        queue_lag_seconds = self._queue_lag_seconds(message)
        self.monitor.record_job_started(job_context)
        started_at = time.perf_counter()
        workspace = None
        visibility = VisibilityHeartbeat(
            self._sqs_client,
            self.queue_config.review_queue_url,
            receipt_handle,
            self.queue_config.visibility_timeout_seconds,
        )
        visibility.start()
        db = SessionLocal()
        try:
            persistence = ReviewPersistence(db)
            persistence.mark_running(review_job_id=queue_message.review_job_id, worker_id=self.worker_id)

            if not job_context:
                raise QueueDispatchException(f"Review job {queue_message.review_job_id} not found.")

            repository = self._load_repository(job_context)
            if not repository:
                raise QueueUnavailableException("Repository metadata could not be loaded.")

            workspace = self._repository_loader.load(
                repository_url=repository["repository_url"],
                branch_name=queue_message.branch_name or repository.get("branch_name") or "main",
                commit_hash=queue_message.commit_hash,
            )
            diff_bundle = self._diff_builder.build(workspace)
            repository_tree = self._build_repository_tree(Path(workspace.repository_root))
            project = self._load_project(queue_message.project_id)
            user = self._load_user(queue_message.user_id)
            progress = self._load_progress(user_id=queue_message.user_id, project_name=project.get("title", ""))
            job_context["project_name"] = project.get("title", "")
            context_bundle = self._context_builder.build(
                project_name=project.get("title", ""),
                repository=repository if repository else None,
                branch_name=queue_message.branch_name or repository.get("branch_name") or "main",
                commit_hash=queue_message.commit_hash,
                changed_files=workspace.changed_files,
                repository_tree=repository_tree,
                repository_root=Path(workspace.repository_root),
                readme_path=self._find_readme(Path(workspace.repository_root)),
                previous_review=self._load_previous_review(queue_message.repository_id, queue_message.commit_hash),
                project_metadata={
                    "id": project.get("id"),
                    "title": project.get("title", ""),
                    "description": project.get("description", ""),
                },
                repository_metadata=repository,
            )
            prompt_artifact = self._prompt_builder.build(
                context=context_bundle,
                student_metadata={
                    "id": user.get("id"),
                    "name": user.get("name", ""),
                    "email": user.get("email", ""),
                    "project_progress": {
                        "current_step": progress.get("current_step") if progress else 0,
                        "completed_tasks": progress.get("completed_tasks") if progress else "",
                    },
                },
                project_metadata=project,
                diff_bundle=diff_bundle.to_dict(),
            )

            llm_response = self._llm_client.generate(
                LLMRequest(
                    provider=self.settings.llm_provider,
                    model="",
                    prompt=prompt_artifact.prompt,
                    metadata={
                        "review_job_id": queue_message.review_job_id,
                        "repository_id": queue_message.repository_id,
                        "trace_id": queue_message.trace_id,
                        "correlation_id": queue_message.correlation_id,
                    },
                )
            )
            parsed = self._review_parser.parse(llm_response.content)
            if parsed.retryable:
                raise QueueValidationException("; ".join(parsed.validation_errors) or "LLM response could not be parsed.")

            enforced = self._policy_engine.enforce(parsed.model)
            breakdown = self._score_calculator.calculate(
                enforced,
                context={
                    "changed_file_count": len(diff_bundle.files),
                    "changed_files": [item.to_dict() for item in diff_bundle.files],
                },
            )
            result = persistence.persist_success(
                review_job=job_context,
                review_job_result=enforced,
                score_breakdown=breakdown,
                llm_response=llm_response.to_dict(),
                parsed_review=parsed.to_dict(),
                context=context_bundle.to_dict(),
                repository_metadata=repository,
                diff_bundle=diff_bundle.to_dict(),
                prompt_artifact=prompt_artifact.to_dict(),
                worker_id=self.worker_id,
                review_duration_seconds=time.perf_counter() - started_at,
                prompt_tokens=llm_response.prompt_tokens,
                completion_tokens=llm_response.completion_tokens,
                estimated_cost_usd=llm_response.estimated_cost_usd,
                model_used=llm_response.model,
                llm_provider=llm_response.provider,
                trace_id=queue_message.trace_id,
                correlation_id=queue_message.correlation_id,
            )
            event_payload = persistence.publish_review_completed_event_stub(result.event_payload)
            self._delete_message(receipt_handle)
            duration_ms = round((time.perf_counter() - started_at) * 1000)
            self.monitor.record_job_finished(duration_ms, queue_lag_seconds)
            self._log_review_success(
                queue_message=queue_message,
                llm_response=llm_response,
                duration_ms=duration_ms,
                score=breakdown.overall_score,
                cost=llm_response.estimated_cost_usd,
                event_payload=event_payload,
            )
            db.close()
            return
        except (QueueValidationException, json.JSONDecodeError, ValueError) as exc:
            db.close()
            self._handle_failure(
                message=message,
                queue_message=queue_message if "queue_message" in locals() else None,
                receipt_handle=receipt_handle,
                approx_receive_count=approx_receive_count,
                error=exc,
                retryable=True,
                worker_id=self.worker_id,
            )
        except Exception as exc:
            db.close()
            retryable = self._is_retryable_exception(exc)
            self._handle_failure(
                message=message,
                queue_message=queue_message if "queue_message" in locals() else None,
                receipt_handle=receipt_handle,
                approx_receive_count=approx_receive_count,
                error=exc,
                retryable=retryable,
                worker_id=self.worker_id,
            )
        finally:
            if workspace is not None:
                self._repository_loader.cleanup_workspace(workspace)
            visibility.stop()

    def _deserialize_message(self, body: str) -> ReviewJobMessage:
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise QueueValidationException("Queue message body must be a JSON object.")
        required = [
            "review_job_id",
            "repository_id",
            "project_id",
            "user_id",
            "stage_id",
            "commit_hash",
            "trigger_source",
            "review_source",
            "priority",
            "retry_count",
            "created_at",
            "correlation_id",
            "trace_id",
            "schema_version",
        ]
        for field_name in required:
            if field_name not in payload:
                raise QueueValidationException(f"Missing required queue field '{field_name}'.")
        return ReviewJobMessage(
            review_job_id=int(payload["review_job_id"]),
            repository_id=int(payload["repository_id"]),
            project_id=int(payload["project_id"]),
            user_id=int(payload["user_id"]),
            stage_id=int(payload["stage_id"]),
            commit_hash=str(payload["commit_hash"]),
            trigger_source=str(payload["trigger_source"]),
            review_source=str(payload["review_source"]),
            priority=int(payload["priority"]),
            retry_count=int(payload["retry_count"]),
            created_at=str(payload["created_at"]),
            correlation_id=str(payload["correlation_id"]),
            trace_id=str(payload["trace_id"]),
            schema_version=int(payload["schema_version"]),
            branch_name=str(payload.get("branch_name") or "main"),
            queue_name=str(payload.get("queue_name") or ""),
            job_status=str(payload.get("job_status") or ""),
            source_payload=self._as_dict(payload.get("source_payload")),
            commit_metadata=self._as_dict(payload.get("commit_metadata")),
            job_metadata=self._as_dict(payload.get("job_metadata")),
        )

    def _load_job_context(self, review_job_id: int) -> dict[str, Any]:
        with SessionLocal() as db:
            row = db.execute(
                text(
                    """
                    SELECT id, user_id, github_repository_id, github_commit_history_id, stage_id, commit_hash,
                           branch_name, review_source, triggered_by, worker_id, queue_name, queue_message_id,
                           job_status, retry_count, priority, queued_at, dispatched_at, started_at, completed_at,
                           failed_at, next_retry_at, error_code, error_message, job_payload, created_at, updated_at
                    FROM github_review_jobs
                    WHERE id = :review_job_id
                    """
                ),
                {"review_job_id": review_job_id},
            ).mappings().first()
            return dict(row) if row else {}

    def _load_repository(self, review_job: dict[str, Any]) -> dict[str, Any]:
        with SessionLocal() as db:
            row = db.execute(
                text(
                    """
                    SELECT id, user_id, github_username, repository_url, branch_name, last_commit_hash,
                           last_reviewed_commit, last_pull_at, last_scheduler_check, webhook_enabled,
                           default_branch, connection_status, connection_verified_at, connected_at
                    FROM github_repositories
                    WHERE id = :repository_id
                    """
                ),
                {"repository_id": review_job["github_repository_id"]},
            ).mappings().first()
            return dict(row) if row else {}

    def _load_user(self, user_id: int) -> dict[str, Any]:
        with SessionLocal() as db:
            row = db.execute(
                text("SELECT id, name, email, resume_text FROM users WHERE id = :user_id"),
                {"user_id": user_id},
            ).mappings().first()
            return dict(row) if row else {}

    def _load_project(self, project_id: int) -> dict[str, Any]:
        with SessionLocal() as db:
            row = db.execute(
                text("SELECT id, title, description, category, timeline_weeks, steps_json FROM projects WHERE id = :project_id"),
                {"project_id": project_id},
            ).mappings().first()
            return dict(row) if row else {}

    def _load_progress(self, user_id: int, project_name: str) -> dict[str, Any]:
        if not project_name:
            return {}
        with SessionLocal() as db:
            row = db.execute(
                text(
                    """
                    SELECT id, user_id, project_name, current_step, completed_tasks
                    FROM project_progress
                    WHERE user_id = :user_id
                      AND LOWER(TRIM(project_name)) = LOWER(TRIM(:project_name))
                    ORDER BY id DESC
                    LIMIT 1
                    """
                ),
                {"user_id": user_id, "project_name": project_name},
            ).mappings().first()
            return dict(row) if row else {}

    def _load_previous_review(self, repository_id: int, commit_hash: str) -> dict[str, Any]:
        with SessionLocal() as db:
            row = db.execute(
                text(
                    """
                    SELECT id, github_review_job_id, summary, feedback, findings, recommendations, review_payload
                    FROM github_review_job_results
                    WHERE github_review_job_id IN (
                        SELECT id
                        FROM github_review_jobs
                        WHERE github_repository_id = :repository_id
                          AND commit_hash = :commit_hash
                    )
                    ORDER BY id DESC
                    LIMIT 1
                    """
                ),
                {"repository_id": repository_id, "commit_hash": commit_hash},
            ).mappings().first()
            return dict(row) if row else {}

    def _build_repository_tree(self, root: Path, max_entries: int = 300) -> list[str]:
        if not root.exists():
            return []
        entries: list[str] = []
        for path in sorted(root.rglob("*")):
            if len(entries) >= max_entries:
                break
            rel = path.relative_to(root)
            if ".git" in rel.parts or "__pycache__" in rel.parts:
                continue
            if path.is_file():
                entries.append(str(rel))
        return entries

    def _find_readme(self, root: Path) -> Path | None:
        for name in ("README.md", "readme.md", "README.txt", "README"):
            candidate = root / name
            if candidate.exists():
                return candidate
        return None

    def _delete_message(self, receipt_handle: str) -> None:
        if not receipt_handle:
            return
        self._sqs_client.delete_message(QueueUrl=self.queue_config.review_queue_url, ReceiptHandle=receipt_handle)

    def _handle_failure(
        self,
        *,
        message: dict[str, Any],
        queue_message: ReviewJobMessage | None,
        receipt_handle: str,
        approx_receive_count: int,
        error: Exception,
        retryable: bool,
        worker_id: str,
    ) -> None:
        review_job_id = queue_message.review_job_id if queue_message else 0
        logger.exception(
            "review_job_processing_failed",
            extra={
                "review_job_id": review_job_id,
                "trace_id": getattr(queue_message, "trace_id", ""),
                "correlation_id": getattr(queue_message, "correlation_id", ""),
                "repository_id": getattr(queue_message, "repository_id", 0),
                "commit_hash": getattr(queue_message, "commit_hash", ""),
                "worker_id": worker_id,
                "status": "retryable" if retryable else "permanent",
                "error": str(error),
            },
        )
        db = SessionLocal()
        try:
            persistence = ReviewPersistence(db)
            review_job = self._load_job_context(review_job_id) if review_job_id else {}
            if review_job:
                persistence.persist_failure(
                    review_job=review_job,
                    status="failed",
                    error_message=str(error),
                    error_code=error.__class__.__name__,
                    worker_id=worker_id,
                    retryable=retryable and approx_receive_count < self.queue_config.max_receive_count,
                )
            if not retryable or approx_receive_count >= self.queue_config.max_receive_count:
                self._send_to_dlq(message, error)
                self._delete_message(receipt_handle)
            self.monitor.record_job_failed()
        finally:
            db.close()

    def _send_to_dlq(self, message: dict[str, Any], error: Exception) -> None:
        if not self.queue_config.review_dlq_url:
            return
        body = message.get("Body") or json.dumps({"error": str(error), "original_message": message}, ensure_ascii=False)
        self._sqs_client.send_message(
            QueueUrl=self.queue_config.review_dlq_url,
            MessageBody=str(body),
        )

    def _queue_lag_seconds(self, message: dict[str, Any]) -> float | None:
        sent_timestamp = (message.get("Attributes") or {}).get("SentTimestamp")
        if not sent_timestamp:
            return None
        try:
            sent = int(sent_timestamp) / 1000.0
            return max(0.0, time.time() - sent)
        except (TypeError, ValueError):
            return None

    def _log_review_success(
        self,
        *,
        queue_message: ReviewJobMessage,
        llm_response: Any,
        duration_ms: int,
        score: int,
        cost: float,
        event_payload: dict[str, Any],
    ) -> None:
        logger.info(
            "review_job_completed",
            extra={
                "review_job_id": queue_message.review_job_id,
                "trace_id": queue_message.trace_id,
                "correlation_id": queue_message.correlation_id,
                "repository_id": queue_message.repository_id,
                "commit_hash": queue_message.commit_hash,
                "duration": duration_ms,
                "worker_id": self.worker_id,
                "llm_provider": getattr(llm_response, "provider", ""),
                "model": getattr(llm_response, "model", ""),
                "tokens": getattr(llm_response, "total_tokens", 0),
                "cost": cost,
                "status": "succeeded",
                "score": score,
                "event": event_payload,
            },
        )

    def _is_retryable_exception(self, exc: Exception) -> bool:
        text_value = str(exc).lower()
        retryable_markers = [
            "timeout",
            "throttl",
            "rate limit",
            "temporarily unavailable",
            "connection",
            "busy",
            "unavailable",
            "parse",
            "json",
        ]
        return any(marker in text_value for marker in retryable_markers)

    def _as_dict(self, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        return {}


def main(argv: list[str] | None = None) -> int:
    from app.workers.worker_runner import main as worker_main

    return worker_main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
