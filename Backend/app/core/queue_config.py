from __future__ import annotations

from dataclasses import dataclass

from app.core.config import Settings
from app.core.queue_exceptions import QueueConfigurationException

DEFAULT_QUEUE_SCHEMA_VERSION = 1
DEFAULT_QUEUE_PRIORITY = 100
DEFAULT_QUEUE_VISIBILITY_TIMEOUT_SECONDS = 60
DEFAULT_QUEUE_LONG_POLL_SECONDS = 20
DEFAULT_QUEUE_RETENTION_SECONDS = 345600
DEFAULT_QUEUE_MAX_RECEIVE_COUNT = 5
DEFAULT_QUEUE_MAX_MESSAGE_SIZE_BYTES = 262144
DEFAULT_QUEUE_DELAY_SECONDS = 0
DEFAULT_QUEUE_MAX_ATTEMPTS = 3
DEFAULT_QUEUE_RETRY_MODE = "standard"


@dataclass(slots=True)
class QueueConfig:
    aws_region: str
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_session_token: str = ""
    aws_endpoint_url: str = ""
    aws_use_ssl: bool = True
    aws_connect_timeout_seconds: int = 5
    aws_read_timeout_seconds: int = 30
    aws_max_attempts: int = DEFAULT_QUEUE_MAX_ATTEMPTS
    aws_retry_mode: str = DEFAULT_QUEUE_RETRY_MODE
    review_queue_name: str = "github-review-queue"
    review_queue_url: str = ""
    review_dlq_name: str = "github-review-dlq"
    review_dlq_url: str = ""
    notification_queue_name: str = "notification-queue"
    notification_queue_url: str = ""
    notification_dlq_name: str = "notification-dlq"
    notification_dlq_url: str = ""
    visibility_timeout_seconds: int = DEFAULT_QUEUE_VISIBILITY_TIMEOUT_SECONDS
    long_poll_seconds: int = DEFAULT_QUEUE_LONG_POLL_SECONDS
    retention_seconds: int = DEFAULT_QUEUE_RETENTION_SECONDS
    max_receive_count: int = DEFAULT_QUEUE_MAX_RECEIVE_COUNT
    max_message_size_bytes: int = DEFAULT_QUEUE_MAX_MESSAGE_SIZE_BYTES
    delay_seconds: int = DEFAULT_QUEUE_DELAY_SECONDS
    sse_enabled: bool = True
    kms_key_id: str = ""
    schema_version: int = DEFAULT_QUEUE_SCHEMA_VERSION
    priority: int = DEFAULT_QUEUE_PRIORITY

    @classmethod
    def from_settings(cls, settings: Settings, *, validate: bool = False) -> "QueueConfig":
        aws_region = str(getattr(settings, "aws_region", "") or "").strip() or "us-east-1"
        config = cls(
            aws_region=aws_region,
            aws_access_key_id=str(getattr(settings, "aws_access_key_id", "") or "").strip(),
            aws_secret_access_key=str(getattr(settings, "aws_secret_access_key", "") or "").strip(),
            aws_session_token=str(getattr(settings, "aws_session_token", "") or "").strip(),
            aws_endpoint_url=str(getattr(settings, "aws_endpoint_url", "") or "").strip(),
            aws_use_ssl=bool(getattr(settings, "aws_use_ssl", True)),
            aws_connect_timeout_seconds=int(getattr(settings, "queue_connect_timeout_seconds", 5) or 5),
            aws_read_timeout_seconds=int(getattr(settings, "queue_read_timeout_seconds", 30) or 30),
            aws_max_attempts=int(getattr(settings, "queue_max_attempts", DEFAULT_QUEUE_MAX_ATTEMPTS) or DEFAULT_QUEUE_MAX_ATTEMPTS),
            aws_retry_mode=str(getattr(settings, "queue_retry_mode", DEFAULT_QUEUE_RETRY_MODE) or DEFAULT_QUEUE_RETRY_MODE).strip() or DEFAULT_QUEUE_RETRY_MODE,
            review_queue_name=str(getattr(settings, "queue_review_name", "github-review-queue") or "github-review-queue").strip(),
            review_queue_url=str(getattr(settings, "queue_review_url", "") or "").strip(),
            review_dlq_name=str(getattr(settings, "queue_review_dlq_name", "github-review-dlq") or "github-review-dlq").strip(),
            review_dlq_url=str(getattr(settings, "queue_review_dlq_url", "") or "").strip(),
            notification_queue_name=str(getattr(settings, "queue_notification_name", "notification-queue") or "notification-queue").strip(),
            notification_queue_url=str(getattr(settings, "queue_notification_url", "") or "").strip(),
            notification_dlq_name=str(getattr(settings, "queue_notification_dlq_name", "notification-dlq") or "notification-dlq").strip(),
            notification_dlq_url=str(getattr(settings, "queue_notification_dlq_url", "") or "").strip(),
            visibility_timeout_seconds=int(getattr(settings, "queue_visibility_timeout_seconds", DEFAULT_QUEUE_VISIBILITY_TIMEOUT_SECONDS) or DEFAULT_QUEUE_VISIBILITY_TIMEOUT_SECONDS),
            long_poll_seconds=int(getattr(settings, "queue_long_poll_seconds", DEFAULT_QUEUE_LONG_POLL_SECONDS) or DEFAULT_QUEUE_LONG_POLL_SECONDS),
            retention_seconds=int(getattr(settings, "queue_retention_seconds", DEFAULT_QUEUE_RETENTION_SECONDS) or DEFAULT_QUEUE_RETENTION_SECONDS),
            max_receive_count=int(getattr(settings, "queue_max_receive_count", DEFAULT_QUEUE_MAX_RECEIVE_COUNT) or DEFAULT_QUEUE_MAX_RECEIVE_COUNT),
            max_message_size_bytes=int(getattr(settings, "queue_max_message_size_bytes", DEFAULT_QUEUE_MAX_MESSAGE_SIZE_BYTES) or DEFAULT_QUEUE_MAX_MESSAGE_SIZE_BYTES),
            delay_seconds=int(getattr(settings, "queue_delay_seconds", DEFAULT_QUEUE_DELAY_SECONDS) or DEFAULT_QUEUE_DELAY_SECONDS),
            sse_enabled=bool(getattr(settings, "queue_sse_enabled", True)),
            kms_key_id=str(getattr(settings, "queue_kms_key_id", "") or "").strip(),
            schema_version=int(getattr(settings, "queue_schema_version", DEFAULT_QUEUE_SCHEMA_VERSION) or DEFAULT_QUEUE_SCHEMA_VERSION),
            priority=int(getattr(settings, "queue_priority", DEFAULT_QUEUE_PRIORITY) or DEFAULT_QUEUE_PRIORITY),
        )
        if validate:
            config.validate()
        return config

    def validate(self) -> None:
        if not self.aws_region:
            raise QueueConfigurationException("AWS region is required for the queue layer.")

        if not self.review_queue_url:
            raise QueueConfigurationException("Review queue URL is required.")

        if self.aws_max_attempts < 1:
            raise QueueConfigurationException("AWS retry attempts must be at least 1.")

        if self.visibility_timeout_seconds <= 0:
            raise QueueConfigurationException("Queue visibility timeout must be positive.")

        if self.long_poll_seconds < 0:
            raise QueueConfigurationException("Queue long polling wait time cannot be negative.")

        if self.max_message_size_bytes <= 0:
            raise QueueConfigurationException("Maximum message size must be positive.")

        if self.max_receive_count < 1:
            raise QueueConfigurationException("Maximum receive count must be at least 1.")
