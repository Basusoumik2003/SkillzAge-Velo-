from __future__ import annotations

import logging
import random
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from app.core.aws_client import (
    BotoCoreError,
    ClientError,
    ConnectTimeoutError,
    EndpointConnectionError,
    NoCredentialsError,
    ParamValidationError,
    QueueConfigurationException,
    ReadTimeoutError,
    SSLError,
    create_sqs_client,
)
from app.core.queue_config import QueueConfig
from app.core.queue_exceptions import QueueDispatchException, QueueUnavailableException, QueueValidationException
from app.services.message_builder import BuiltQueueMessage

logger = logging.getLogger("internlabs-api.queue.sqs")

RETRYABLE_ERROR_CODES = {
    "RequestTimeout",
    "RequestTimeoutException",
    "Throttling",
    "ThrottlingException",
    "TooManyRequestsException",
    "ServiceUnavailable",
    "InternalError",
    "InternalFailure",
    "Unavailable",
}


@dataclass(slots=True)
class SQSDispatchResult:
    status: str
    queue_name: str
    queue_url: str
    message_id: str = ""
    md5_of_body: str = ""
    request_id: str = ""
    attempts: int = 0
    latency_ms: int = 0
    payload: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] = field(default_factory=dict)
    response: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class QueueHealthSnapshot:
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


class SQSQueueProvider:
    def __init__(self, config: QueueConfig):
        self.config = config
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = create_sqs_client(self.config)
        return self._client

    def send_message(
        self,
        *,
        queue_name: str,
        queue_url: str,
        message: BuiltQueueMessage,
        delay_seconds: int | None = None,
    ) -> SQSDispatchResult:
        if not queue_url:
            raise QueueConfigurationException(f"Queue URL is missing for '{queue_name}'.")

        if len(message.body.encode("utf-8")) > int(self.config.max_message_size_bytes):
            raise QueueValidationException("Queue message exceeds the maximum SQS payload size.")

        client = self._get_client()
        start = time.perf_counter()
        attempts = 0
        delay_seconds = int(self.config.delay_seconds if delay_seconds is None else delay_seconds)

        while True:
            attempts += 1
            try:
                response = client.send_message(
                    QueueUrl=queue_url,
                    MessageBody=message.body,
                    MessageAttributes=message.attributes,
                    DelaySeconds=delay_seconds,
                )
                latency_ms = round((time.perf_counter() - start) * 1000)
                result = SQSDispatchResult(
                    status="dispatched",
                    queue_name=queue_name,
                    queue_url=queue_url,
                    message_id=str(response.get("MessageId") or ""),
                    md5_of_body=str(response.get("MD5OfMessageBody") or ""),
                    request_id=str(response.get("ResponseMetadata", {}).get("RequestId") or ""),
                    attempts=attempts,
                    latency_ms=latency_ms,
                    payload=message.payload,
                    response=response,
                )
                logger.info(
                    "queue_dispatch_success",
                    extra={
                        "review_job_id": message.payload.get("review_job_id"),
                        "queue_name": queue_name,
                        "message_id": result.message_id,
                        "trace_id": message.trace_id,
                        "correlation_id": message.correlation_id,
                        "dispatch_duration_ms": latency_ms,
                        "status": result.status,
                        "error": "",
                    },
                )
                return result
            except (NoCredentialsError, EndpointConnectionError, ConnectTimeoutError, ReadTimeoutError, SSLError) as exc:
                if attempts >= self.config.aws_max_attempts:
                    return self._failure_result(queue_name, queue_url, message, attempts, start, exc, "network_error")
                time.sleep(self._retry_delay(attempts))
            except ClientError as exc:
                code = self._client_error_code(exc)
                if code in RETRYABLE_ERROR_CODES and attempts < self.config.aws_max_attempts:
                    time.sleep(self._retry_delay(attempts))
                    continue
                return self._failure_result(queue_name, queue_url, message, attempts, start, exc, code or "client_error")
            except (ParamValidationError, BotoCoreError, QueueDispatchException) as exc:
                return self._failure_result(queue_name, queue_url, message, attempts, start, exc, exc.__class__.__name__)
            except Exception as exc:  # pragma: no cover - safety net
                return self._failure_result(queue_name, queue_url, message, attempts, start, exc, "unexpected_error")

    def send_message_batch(self, *args: Any, **kwargs: Any) -> SQSDispatchResult:
        raise NotImplementedError("SendMessageBatch is reserved for future use.")

    def health_check(self, *, queue_name: str, queue_url: str) -> QueueHealthSnapshot:
        start = time.perf_counter()
        try:
            attributes = self.get_queue_attributes(queue_name=queue_name, queue_url=queue_url)
            latency_ms = round((time.perf_counter() - start) * 1000)
            return QueueHealthSnapshot(
                status="healthy",
                queue_name=queue_name,
                queue_url=queue_url,
                can_connect=True,
                queue_exists=True,
                iam_permissions=True,
                latency_ms=latency_ms,
                attributes=attributes,
                metrics=self.get_queue_metrics(queue_name=queue_name, queue_url=queue_url),
            )
        except Exception as exc:
            latency_ms = round((time.perf_counter() - start) * 1000)
            return QueueHealthSnapshot(
                status="unhealthy",
                queue_name=queue_name,
                queue_url=queue_url,
                can_connect=False,
                queue_exists=False,
                iam_permissions=False,
                latency_ms=latency_ms,
                error={"type": exc.__class__.__name__, "message": str(exc)},
            )

    def get_queue_attributes(self, *, queue_name: str, queue_url: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            response = client.get_queue_attributes(
                QueueUrl=queue_url,
                AttributeNames=[
                    "ApproximateNumberOfMessages",
                    "ApproximateNumberOfMessagesNotVisible",
                    "ApproximateNumberOfMessagesDelayed",
                    "ApproximateAgeOfOldestMessage",
                    "CreatedTimestamp",
                    "LastModifiedTimestamp",
                    "VisibilityTimeout",
                    "MessageRetentionPeriod",
                    "RedrivePolicy",
                    "SqsManagedSseEnabled",
                    "KmsMasterKeyId",
                    "QueueArn",
                ],
            )
            return {
                "queue_name": queue_name,
                "queue_url": queue_url,
                "attributes": response.get("Attributes", {}),
            }
        except ClientError as exc:
            code = self._client_error_code(exc)
            if code in {"AWS.SimpleQueueService.NonExistentQueue", "QueueDoesNotExist", "NonExistentQueue"}:
                raise QueueUnavailableException(f"Queue '{queue_name}' does not exist.") from exc
            raise QueueDispatchException(f"Failed to read queue attributes for '{queue_name}'.") from exc

    def get_queue_metrics(self, *, queue_name: str, queue_url: str) -> dict[str, Any]:
        attributes = self.get_queue_attributes(queue_name=queue_name, queue_url=queue_url).get("attributes", {})
        return {
            "messages_visible": int(attributes.get("ApproximateNumberOfMessages") or 0),
            "messages_not_visible": int(attributes.get("ApproximateNumberOfMessagesNotVisible") or 0),
            "messages_delayed": int(attributes.get("ApproximateNumberOfMessagesDelayed") or 0),
            "oldest_message_age_seconds": int(attributes.get("ApproximateAgeOfOldestMessage") or 0),
            "visibility_timeout_seconds": int(attributes.get("VisibilityTimeout") or 0),
            "retention_seconds": int(attributes.get("MessageRetentionPeriod") or 0),
        }

    def queue_available(self, *, queue_name: str, queue_url: str) -> bool:
        snapshot = self.health_check(queue_name=queue_name, queue_url=queue_url)
        return snapshot.can_connect and snapshot.queue_exists

    def _failure_result(
        self,
        queue_name: str,
        queue_url: str,
        message: BuiltQueueMessage,
        attempts: int,
        start: float,
        exc: Exception,
        error_code: str,
    ) -> SQSDispatchResult:
        latency_ms = round((time.perf_counter() - start) * 1000)
        result = SQSDispatchResult(
            status="failed",
            queue_name=queue_name,
            queue_url=queue_url,
            attempts=attempts,
            latency_ms=latency_ms,
            payload=message.payload,
            error={
                "type": exc.__class__.__name__,
                "code": error_code,
                "message": str(exc),
            },
        )
        logger.error(
            "queue_dispatch_failed",
            extra={
                "review_job_id": message.payload.get("review_job_id"),
                "queue_name": queue_name,
                "message_id": "",
                "trace_id": message.trace_id,
                "correlation_id": message.correlation_id,
                "dispatch_duration_ms": latency_ms,
                "status": result.status,
                "error": result.error,
            },
        )
        return result

    def _retry_delay(self, attempts: int) -> float:
        base_delay = 0.25 * (2 ** max(attempts - 1, 0))
        return min(base_delay + random.uniform(0.0, 0.25), 2.0)

    def _client_error_code(self, exc: ClientError) -> str:
        response = getattr(exc, "response", {}) or {}
        error = response.get("Error", {}) if isinstance(response, dict) else {}
        return str(error.get("Code") or "")
