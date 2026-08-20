"""S3 upload integration for deliverable submissions. Uses boto3 directly
(already a dependency - see app/requirements.txt and app/core/aws_client.py,
which hand-rolls SigV4 only because it needs to work without boto3 for the
SQS layer; deliverables have no such constraint)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings


class S3ConfigurationError(RuntimeError):
    pass


class S3OperationError(RuntimeError):
    pass


def _safe_segment(value: str) -> str:
    import re

    return re.sub(r"[^\w.\-]", "_", str(value or "").strip())


def _build_object_key(*, folder: str, file_name: str) -> str:
    date_prefix = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    unique = uuid.uuid4().hex[:12]
    safe_name = _safe_segment(file_name) or "file"
    return f"{_safe_segment(folder)}/{date_prefix}/{unique}_{safe_name}"


def _client():
    settings = get_settings()
    if not (settings.aws_access_key_id and settings.aws_secret_access_key and settings.aws_bucket_name):
        raise S3ConfigurationError("AWS S3 credentials/bucket are not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_BUCKET_NAME).")

    kwargs: dict[str, Any] = {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
        "region_name": settings.aws_region,
        "config": BotocoreConfig(signature_version="s3v4"),
    }
    if settings.aws_session_token:
        kwargs["aws_session_token"] = settings.aws_session_token
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    kwargs["use_ssl"] = bool(settings.aws_use_ssl)
    return boto3.client("s3", **kwargs)


def _object_url(key: str) -> str:
    settings = get_settings()
    if settings.aws_endpoint_url:
        return f"{settings.aws_endpoint_url.rstrip('/')}/{settings.aws_bucket_name}/{key}"
    return f"https://{settings.aws_bucket_name}.s3.{settings.aws_region}.amazonaws.com/{key}"


def create_presigned_upload(
    *, folder: str, file_name: str, content_type: str = "application/octet-stream", expires_in_seconds: int = 600
) -> dict[str, Any]:
    """Client PUTs the raw file straight to S3 with this URL (header
    Content-Type must match `content_type`), then reports the key/url back
    to the API to attach it to a submission - the file bytes never transit
    through this backend."""
    settings = get_settings()
    key = _build_object_key(folder=folder, file_name=file_name)
    client = _client()
    try:
        upload_url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.aws_bucket_name,
                "Key": key,
                "ContentType": content_type or "application/octet-stream",
            },
            ExpiresIn=max(60, min(3600, int(expires_in_seconds or 600))),
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3OperationError(f"Could not create a presigned upload URL: {exc}") from exc

    return {
        "upload_url": upload_url,
        "s3_key": key,
        "s3_url": _object_url(key),
        "expires_in_seconds": max(60, min(3600, int(expires_in_seconds or 600))),
    }


def upload_bytes(*, folder: str, file_name: str, data: bytes, content_type: str = "application/octet-stream") -> dict[str, Any]:
    """Server-side upload path, used when the client sends the file directly
    to our API (multipart/form-data) instead of doing a presigned PUT."""
    settings = get_settings()
    key = _build_object_key(folder=folder, file_name=file_name)
    client = _client()
    try:
        client.put_object(
            Bucket=settings.aws_bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3OperationError(f"S3 upload failed: {exc}") from exc

    return {"s3_key": key, "s3_url": _object_url(key), "file_size": len(data)}


def create_presigned_download(*, key: str, expires_in_seconds: int = 600) -> str:
    settings = get_settings()
    client = _client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.aws_bucket_name, "Key": key},
            ExpiresIn=max(60, min(3600, int(expires_in_seconds or 600))),
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3OperationError(f"Could not create a presigned download URL: {exc}") from exc


def delete_object(*, key: str) -> None:
    settings = get_settings()
    client = _client()
    try:
        client.delete_object(Bucket=settings.aws_bucket_name, Key=key)
    except (BotoCoreError, ClientError) as exc:
        raise S3OperationError(f"Could not delete S3 object '{key}': {exc}") from exc
