from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from app.core.config import Settings, get_settings
from app.core.queue_config import QueueConfig
from app.core.queue_exceptions import QueueConfigurationException, QueueDuplicateDispatchException, QueueValidationException
from app.services.message_builder import QueueMessageBuilder
from app.services.sqs_provider import SQSQueueProvider

logger = logging.getLogger("internlabs-api.queue.dispatcher")

ACTIVE_JOB_STATUSES = {"dispatched", "running", "retry_wait"}


@dataclass(slots=True)
class QueueDispatchResult:
    status: str
    queue_name: str
    queue_url: str = ""
    message_id: str = ""
    request_id: str = ""
    attempts: int = 0
    latency_ms: int = 0
    trace_id: str = ""
    correlation_id: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    message: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] = field(default_factory=dict)
    provider_result: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class QueueHealthResult:
    status: str
    queue_name: str
    queue_url: str
    can_connect: bool
    queue_exists: bool
    iam_permissions: bool
    latency_ms: int
    attributes: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class QueueDispatcher:
    def __init__(
        self,
        config: QueueConfig,
        provider: SQSQueueProvider | None = None,
        message_builder: QueueMessageBuilder | None = None,
    ):
        self.config = config
        self.provider = provider or SQSQueueProvider(config)
        self.message_builder = message_builder or QueueMessageBuilder(config)

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> "QueueDispatcher":
        settings = settings or get_settings()
        config = QueueConfig.from_settings(settings)
        return cls(config=config)

    def dispatch(
        self,
        *,
        review_job: dict[str, Any],
        project_id: int = 0,
        project_name: str = "",
        trigger_source: str,
        review_source: str,
        correlation_id: str,
        trace_id: str | None = None,
        queue_name: str | None = None,
        source_payload: dict[str, Any] | None = None,
        commit_metadata: dict[str, Any] | None = None,
    ) -> QueueDispatchResult:
        start = time.perf_counter()
        try:
            self.config.validate()
            job_status = str(review_job.get("job_status") or "").strip().lower()
            if review_job.get("queue_message_id") or job_status in ACTIVE_JOB_STATUSES:
                return QueueDispatchResult(
                    status="skipped_duplicate",
                    queue_name=str(queue_name or review_job.get("queue_name") or self.config.review_queue_name),
                    queue_url=self.config.review_queue_url,
                    trace_id=str(trace_id or review_job.get("trace_id") or ""),
                    correlation_id=str(correlation_id or review_job.get("correlation_id") or ""),
                    payload={"reason": "duplicate_dispatch_attempt"},
                )

            review_job = dict(review_job)
            review_job["correlation_id"] = correlation_id
            review_job["trace_id"] = trace_id or review_job.get("trace_id") or ""
            review_job["commit_metadata"] = self._normalize_mapping(commit_metadata or review_job.get("commit_metadata"))
            review_job["job_payload"] = self._normalize_mapping(review_job.get("job_payload"))
            review_job["source_payload"] = self._normalize_mapping(source_payload or review_job.get("source_payload"))

            target_queue_name = str(queue_name or review_job.get("queue_name") or self.config.review_queue_name).strip()
            target_queue_url = self._resolve_queue_url(target_queue_name)

            built_message = self.message_builder.build_review_message(
                review_job=review_job,
                project_id=project_id,
                trace_id=trace_id,
                correlation_id=correlation_id,
                trigger_source=trigger_source,
                review_source=review_source,
                source_payload=review_job["source_payload"],
                queue_name=target_queue_name,
            )

            provider_result = self.provider.send_message(
                queue_name=target_queue_name,
                queue_url=target_queue_url,
                message=built_message,
            )
            latency_ms = round((time.perf_counter() - start) * 1000)
            result = QueueDispatchResult(
                status=provider_result.status,
                queue_name=provider_result.queue_name,
                queue_url=provider_result.queue_url,
                message_id=provider_result.message_id,
                request_id=provider_result.request_id,
                attempts=provider_result.attempts,
                latency_ms=latency_ms,
                trace_id=built_message.trace_id,
                correlation_id=built_message.correlation_id,
                payload=built_message.payload,
                message=built_message.to_dict(),
                provider_result=provider_result.to_dict(),
            )
            logger.info(
                "queue_dispatch_complete",
                extra={
                    "review_job_id": built_message.payload.get("review_job_id"),
                    "queue_name": result.queue_name,
                    "message_id": result.message_id,
                    "trace_id": result.trace_id,
                    "correlation_id": result.correlation_id,
                    "dispatch_duration_ms": result.latency_ms,
                    "status": result.status,
                    "error": "",
                },
            )
            return result
        except (QueueValidationException, QueueConfigurationException, QueueDuplicateDispatchException) as exc:
            latency_ms = round((time.perf_counter() - start) * 1000)
            return QueueDispatchResult(
                status="failed",
                queue_name=str(queue_name or review_job.get("queue_name") or self.config.review_queue_name),
                queue_url=self._resolve_queue_url(str(queue_name or review_job.get("queue_name") or self.config.review_queue_name), allow_missing=True),
                latency_ms=latency_ms,
                trace_id=str(trace_id or review_job.get("trace_id") or ""),
                correlation_id=str(correlation_id or review_job.get("correlation_id") or ""),
                payload=review_job,
                error={"type": exc.__class__.__name__, "message": str(exc)},
            )
        except Exception as exc:  # pragma: no cover - safety net
            latency_ms = round((time.perf_counter() - start) * 1000)
            logger.exception("queue_dispatch_unhandled_error")
            return QueueDispatchResult(
                status="failed",
                queue_name=str(queue_name or review_job.get("queue_name") or self.config.review_queue_name),
                queue_url=self._resolve_queue_url(str(queue_name or review_job.get("queue_name") or self.config.review_queue_name), allow_missing=True),
                latency_ms=latency_ms,
                trace_id=str(trace_id or review_job.get("trace_id") or ""),
                correlation_id=str(correlation_id or review_job.get("correlation_id") or ""),
                payload=review_job,
                error={"type": exc.__class__.__name__, "message": str(exc)},
            )

    def health_check(self, *, queue_name: str | None = None) -> QueueHealthResult:
        target_queue_name = str(queue_name or self.config.review_queue_name).strip()
        queue_url = self._resolve_queue_url(target_queue_name)
        snapshot = self.provider.health_check(queue_name=target_queue_name, queue_url=queue_url)
        return QueueHealthResult(**snapshot.to_dict())

    def metrics(self, *, queue_name: str | None = None) -> dict[str, Any]:
        target_queue_name = str(queue_name or self.config.review_queue_name).strip()
        queue_url = self._resolve_queue_url(target_queue_name)
        return {
            "queue_name": target_queue_name,
            "queue_url": queue_url,
            "attributes": self.provider.get_queue_attributes(queue_name=target_queue_name, queue_url=queue_url),
            "metrics": self.provider.get_queue_metrics(queue_name=target_queue_name, queue_url=queue_url),
        }

    def _resolve_queue_url(self, queue_name: str, allow_missing: bool = False) -> str:
        normalized = queue_name.strip().lower()
        if normalized in {self.config.review_queue_name.lower(), "review", "github-review-queue"}:
            return self.config.review_queue_url
        if normalized in {self.config.review_dlq_name.lower(), "github-review-dlq"}:
            return self.config.review_dlq_url
        if normalized in {self.config.notification_queue_name.lower(), "notification", "notification-queue"}:
            return self.config.notification_queue_url
        if normalized in {self.config.notification_dlq_name.lower(), "notification-dlq"}:
            return self.config.notification_dlq_url
        if allow_missing:
            return ""
        raise QueueConfigurationException(f"Unknown queue '{queue_name}'.")

    def _normalize_mapping(self, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        if value is None:
            return {}
        return {}
