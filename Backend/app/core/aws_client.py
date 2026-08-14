from __future__ import annotations

from typing import Any

from app.core.queue_config import QueueConfig
from app.core.queue_exceptions import QueueConfigurationException

try:  # pragma: no cover - dependency guard
    import boto3
    from botocore.config import Config as BotocoreConfig
    from botocore.exceptions import (
        BotoCoreError,
        ClientError,
        ConnectTimeoutError,
        EndpointConnectionError,
        NoCredentialsError,
        ParamValidationError,
        ReadTimeoutError,
        SSLError,
    )
except ImportError:  # pragma: no cover - handled at runtime
    boto3 = None  # type: ignore[assignment]
    BotocoreConfig = None  # type: ignore[assignment]

    class BotoCoreError(Exception):
        pass

    class ClientError(Exception):
        pass

    class ConnectTimeoutError(Exception):
        pass

    class EndpointConnectionError(Exception):
        pass

    class NoCredentialsError(Exception):
        pass

    class ParamValidationError(Exception):
        pass

    class ReadTimeoutError(Exception):
        pass

    class SSLError(Exception):
        pass


def create_boto3_session(config: QueueConfig) -> Any:
    if boto3 is None:
        raise QueueConfigurationException("boto3 is required to use the AWS SQS queue layer.")

    session_kwargs: dict[str, Any] = {}
    if config.aws_access_key_id and config.aws_secret_access_key:
        session_kwargs["aws_access_key_id"] = config.aws_access_key_id
        session_kwargs["aws_secret_access_key"] = config.aws_secret_access_key
        if config.aws_session_token:
            session_kwargs["aws_session_token"] = config.aws_session_token
    if config.aws_region:
        session_kwargs["region_name"] = config.aws_region
    return boto3.session.Session(**session_kwargs)


def create_sqs_client(config: QueueConfig) -> Any:
    if boto3 is None or BotocoreConfig is None:
        raise QueueConfigurationException("boto3 and botocore are required to use the AWS SQS queue layer.")

    boto_config = BotocoreConfig(
        region_name=config.aws_region,
        retries={
            "max_attempts": int(config.aws_max_attempts),
            "mode": config.aws_retry_mode,
        },
        connect_timeout=int(config.aws_connect_timeout_seconds),
        read_timeout=int(config.aws_read_timeout_seconds),
        parameter_validation=True,
    )

    session = create_boto3_session(config)
    client_kwargs: dict[str, Any] = {
        "config": boto_config,
        "use_ssl": bool(config.aws_use_ssl),
    }
    if config.aws_endpoint_url:
        client_kwargs["endpoint_url"] = config.aws_endpoint_url

    return session.client("sqs", **client_kwargs)
