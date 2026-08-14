from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.core.queue_config import QueueConfig
from app.core.queue_exceptions import QueueValidationException


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _normalize_int(value: Any, field_name: str) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise QueueValidationException(f"{field_name} must be an integer.") from exc
    return normalized


def _normalize_str(value: Any, field_name: str) -> str:
    text_value = str(value or "").strip()
    if not text_value:
        raise QueueValidationException(f"{field_name} is required.")
    return text_value


@dataclass(slots=True)
class BuiltQueueMessage:
    body: str
    payload: dict[str, Any] = field(default_factory=dict)
    attributes: dict[str, dict[str, str]] = field(default_factory=dict)
    schema_version: int = 1
    trace_id: str = ""
    correlation_id: str = ""
    queue_name: str = ""
    message_type: str = "github_review"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class QueueMessageBuilder:
    def __init__(self, config: QueueConfig):
        self.config = config

    def build_review_message(
        self,
        *,
        review_job: dict[str, Any],
        project_id: int,
        trace_id: str | None = None,
        correlation_id: str | None = None,
        trigger_source: str,
        review_source: str,
        source_payload: dict[str, Any] | None = None,
        queue_name: str | None = None,
    ) -> BuiltQueueMessage:
        review_job_id = _normalize_int(review_job.get("id"), "review_job_id")
        repository_id = _normalize_int(review_job.get("github_repository_id"), "repository_id")
        user_id = _normalize_int(review_job.get("user_id"), "user_id")
        stage_id = _normalize_int(review_job.get("stage_id"), "stage_id")
        commit_hash = _normalize_str(review_job.get("commit_hash"), "commit_hash")
        priority = _normalize_int(review_job.get("priority", self.config.priority), "priority")
        retry_count = _normalize_int(review_job.get("retry_count", 0), "retry_count")
        queue_name = _normalize_str(queue_name or review_job.get("queue_name") or self.config.review_queue_name, "queue_name")

        resolved_trace_id = str(trace_id or review_job.get("trace_id") or uuid.uuid4().hex).strip()
        resolved_correlation_id = str(correlation_id or review_job.get("correlation_id") or "").strip()
        if not resolved_correlation_id:
            raise QueueValidationException("correlation_id is required.")

        created_at_raw = review_job.get("created_at") or review_job.get("queued_at") or _utcnow()
        if isinstance(created_at_raw, datetime):
            created_at = created_at_raw.astimezone(timezone.utc).isoformat()
        else:
            created_at = str(created_at_raw)

        payload = {
            "schema_version": int(review_job.get("schema_version") or self.config.schema_version),
            "message_type": "github_review",
            "review_job_id": review_job_id,
            "repository_id": repository_id,
            "project_id": int(project_id or 0),
            "user_id": user_id,
            "stage_id": stage_id,
            "commit_hash": commit_hash,
            "trigger_source": _normalize_str(trigger_source, "trigger_source"),
            "review_source": _normalize_str(review_source, "review_source"),
            "priority": priority,
            "retry_count": retry_count,
            "created_at": created_at,
            "correlation_id": resolved_correlation_id,
            "trace_id": resolved_trace_id,
            "branch_name": str(review_job.get("branch_name") or "main").strip() or "main",
            "job_status": str(review_job.get("job_status") or "queued").strip(),
            "commit_metadata": review_job.get("commit_metadata") or {},
            "job_metadata": review_job.get("job_payload") or {},
            "source_payload": dict(source_payload or review_job.get("source_payload") or {}),
        }

        attributes = {
            "schema_version": {"DataType": "Number", "StringValue": str(payload["schema_version"])},
            "review_job_id": {"DataType": "Number", "StringValue": str(review_job_id)},
            "repository_id": {"DataType": "Number", "StringValue": str(repository_id)},
            "project_id": {"DataType": "Number", "StringValue": str(int(project_id or 0))},
            "user_id": {"DataType": "Number", "StringValue": str(user_id)},
            "stage_id": {"DataType": "Number", "StringValue": str(stage_id)},
            "commit_hash": {"DataType": "String", "StringValue": commit_hash},
            "trigger_source": {"DataType": "String", "StringValue": payload["trigger_source"]},
            "review_source": {"DataType": "String", "StringValue": payload["review_source"]},
            "correlation_id": {"DataType": "String", "StringValue": resolved_correlation_id},
            "trace_id": {"DataType": "String", "StringValue": resolved_trace_id},
            "priority": {"DataType": "Number", "StringValue": str(priority)},
            "retry_count": {"DataType": "Number", "StringValue": str(retry_count)},
        }

        return BuiltQueueMessage(
            body=_json_dumps(payload),
            payload=payload,
            attributes=attributes,
            schema_version=payload["schema_version"],
            trace_id=resolved_trace_id,
            correlation_id=resolved_correlation_id,
            queue_name=queue_name,
        )
