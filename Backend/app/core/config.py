from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            Path(__file__).resolve().parents[3] / ".env",
            Path(__file__).resolve().parents[2] / ".env",
            Path(__file__).resolve().parents[1] / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(default="sqlite:///./app.db", alias="DATABASE_URL")
    cors_origins: str = Field(default="http://localhost:3000,http://127.0.0.1:3000", alias="CORS_ORIGINS")

    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    openai_light_model: str = Field(default="", alias="OPENAI_LIGHT_MODEL")
    openai_mentor_model: str = Field(default="", alias="OPENAI_MENTOR_MODEL")
    openai_embedding_model: str = Field(default="text-embedding-3-small", alias="OPENAI_EMBEDDING_MODEL")

    redis_url: str = Field(default="", alias="REDIS_URL")
    chat_history_cache_limit: int = Field(default=100, alias="CHAT_HISTORY_CACHE_LIMIT")
    chat_history_cache_ttl_seconds: int = Field(default=900, alias="CHAT_HISTORY_CACHE_TTL_SECONDS")

    aws_access_key_id: str = Field(default="", alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", alias="AWS_SECRET_ACCESS_KEY")
    aws_session_token: str = Field(default="", alias="AWS_SESSION_TOKEN")
    aws_region: str = Field(default="ap-south-1", alias="AWS_REGION")
    aws_bucket_name: str = Field(default="", alias="AWS_BUCKET_NAME")
    aws_endpoint_url: str = Field(default="", alias="AWS_ENDPOINT_URL")
    aws_use_ssl: bool = Field(default=True, alias="AWS_USE_SSL")

    queue_review_name: str = Field(default="github-review-queue", alias="QUEUE_REVIEW_NAME")
    queue_review_url: str = Field(default="", alias="QUEUE_REVIEW_URL")
    queue_review_dlq_name: str = Field(default="github-review-dlq", alias="QUEUE_REVIEW_DLQ_NAME")
    queue_review_dlq_url: str = Field(default="", alias="QUEUE_REVIEW_DLQ_URL")
    queue_notification_name: str = Field(default="notification-queue", alias="QUEUE_NOTIFICATION_NAME")
    queue_notification_url: str = Field(default="", alias="QUEUE_NOTIFICATION_URL")
    queue_notification_dlq_name: str = Field(default="notification-dlq", alias="QUEUE_NOTIFICATION_DLQ_NAME")
    queue_notification_dlq_url: str = Field(default="", alias="QUEUE_NOTIFICATION_DLQ_URL")
    queue_visibility_timeout_seconds: int = Field(default=60, alias="QUEUE_VISIBILITY_TIMEOUT_SECONDS")
    queue_long_poll_seconds: int = Field(default=20, alias="QUEUE_LONG_POLL_SECONDS")
    queue_retention_seconds: int = Field(default=345600, alias="QUEUE_RETENTION_SECONDS")
    queue_max_receive_count: int = Field(default=5, alias="QUEUE_MAX_RECEIVE_COUNT")
    queue_max_message_size_bytes: int = Field(default=262144, alias="QUEUE_MAX_MESSAGE_SIZE_BYTES")
    queue_delay_seconds: int = Field(default=0, alias="QUEUE_DELAY_SECONDS")
    queue_sse_enabled: bool = Field(default=True, alias="QUEUE_SSE_ENABLED")
    queue_kms_key_id: str = Field(default="", alias="QUEUE_KMS_KEY_ID")
    queue_schema_version: int = Field(default=1, alias="QUEUE_SCHEMA_VERSION")
    queue_priority: int = Field(default=100, alias="QUEUE_PRIORITY")
    queue_connect_timeout_seconds: int = Field(default=5, alias="QUEUE_CONNECT_TIMEOUT_SECONDS")
    queue_read_timeout_seconds: int = Field(default=30, alias="QUEUE_READ_TIMEOUT_SECONDS")
    queue_max_attempts: int = Field(default=3, alias="QUEUE_MAX_ATTEMPTS")
    queue_retry_mode: str = Field(default="standard", alias="QUEUE_RETRY_MODE")

    scheduler_enabled: bool = Field(default=True, alias="SCHEDULER_ENABLED")
    scheduler_interval_minutes: int = Field(default=60, alias="SCHEDULER_INTERVAL_MINUTES")
    inactivity_threshold_days: int = Field(default=3, alias="INACTIVITY_THRESHOLD_DAYS")
    enable_inactivity_reminders: bool = Field(default=True, alias="ENABLE_INACTIVITY_REMINDERS")
    review_email_enabled: bool = Field(default=False, alias="REVIEW_EMAIL_ENABLED")

    tenant_id: str = Field(default="", alias="TENANT_ID")
    client_id: str = Field(default="", alias="CLIENT_ID")
    client_secret: str = Field(default="", alias="CLIENT_SECRET")
    mailbox: str = Field(default="", alias="MAILBOX")

    google_client_id: str = Field(default="", alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(default="", alias="GOOGLE_REDIRECT_URI")

    jwt_secret_key: str = Field(default="change_me", alias="JWT_SECRET_KEY")
    jwt_issuer: str = Field(default="internlabs-auth-service", alias="JWT_ISSUER")
    jwt_audience: str = Field(default="internlabs-api", alias="JWT_AUDIENCE")
    bypass_api_auth: bool = Field(default=False, alias="BYPASS_API_AUTH")

    def __init__(self, **data):
        super().__init__(**data)
        self.cors_origins = str(self.cors_origins or "").strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
