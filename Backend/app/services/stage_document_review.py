from __future__ import annotations

import asyncio
import io
import hashlib
import hmac
import json
import logging
import re
import time
import zipfile
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

logger = logging.getLogger(__name__)

import requests
from PyPDF2 import PdfReader

try:
    from markitdown import MarkItDown
except Exception:
    MarkItDown = None

from app.core.config import get_settings
from app.services.ai_content_detection_service import detect as detect_ai_content
from app.services.ai_usage_service import extract_usage_metadata, record_ai_usage_event
from app.services.review_runner import _openai_review_model


PASSING_SCORE = 75
MAX_UPLOADED_DOCUMENT_CHARS = 50000
MAX_DOCUMENT_CHARS = MAX_UPLOADED_DOCUMENT_CHARS
MAX_ALLOWED_INPUT_TOKENS = max(1, MAX_DOCUMENT_CHARS // 4)
PROMPT_VERSION = "stage-document-review-v2"

def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_trace_step(name: str, status: str = "SUCCESS", warning: str = "", error: str = "") -> dict[str, Any]:
    now = _utc_iso()
    return {
        "step_name": name,
        "status": status,
        "start_time": now,
        "end_time": now,
        "duration_ms": 0,
        "error_message": error,
        "warning_message": warning,
    }


def _finish_trace_step(step: dict[str, Any], started: float, status: str = "SUCCESS", warning: str = "", error: str = "") -> dict[str, Any]:
    step["status"] = status
    step["end_time"] = _utc_iso()
    step["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
    if warning:
        step["warning_message"] = warning
    if error:
        step["error_message"] = error
    return step


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", str(text or "")))


def _count_markdown_images(text: str) -> int:
    return len(re.findall(r"!\[[^\]]*\]\([^)]+\)", str(text or "")))


def _prompt_preview(prompt: str, limit: int = 1200) -> str:
    value = str(prompt or "")
    return value[:limit]


def _safe_words(text: str) -> list[str]:
    stop = {
        "and", "the", "for", "with", "from", "that", "this", "into", "your", "you", "are", "has",
        "have", "will", "must", "should", "stage", "deliverable", "complete", "document", "basic",
    }
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9]{3,}", str(text or "").lower())
    return [word for word in words if word not in stop]


def _extract_keywords(*parts: str) -> list[str]:
    seen: set[str] = set()
    keywords: list[str] = []
    for word in _safe_words(" ".join(parts)):
        if word in seen:
            continue
        seen.add(word)
        keywords.append(word)
        if len(keywords) >= 14:
            break
    return keywords


def _fallback_review(payload: dict[str, Any], document_text: str) -> dict[str, Any]:
    deliverable = str(payload.get("deliverable") or "")
    title = str(payload.get("stage_title") or "")
    keywords = _extract_keywords(title, deliverable)
    text = str(document_text or "").lower()
    matched = [word for word in keywords if word in text]
    readable = len(text.strip()) >= 250
    coverage = len(matched) / max(1, min(len(keywords), 8))
    passed = readable and coverage >= 0.35
    score = 82 if passed else (55 if readable else 30)
    if readable and not passed:
        score = max(score, min(70, int(coverage * 100)))
    return {
        "status": "pass" if passed else "fail",
        "score": score,
        "passing_score": PASSING_SCORE,
        "safe_student_feedback": (
            "Document review passed. Your submission covers the main deliverable well enough to move forward."
            if passed
            else (
                "Document review needs revision. I could not verify enough coverage of the stage deliverable. "
                "Update the document so it clearly addresses the requested deliverable, includes the major sections, "
                "and uses specific project details instead of generic notes."
            )
        ),
        "missing_items": [] if passed else ["Clear coverage of the stage deliverable", "Specific project details tied to the current stage"],
        "weak_areas": [] if passed else ["The submission is too thin or does not visibly match enough deliverable keywords."],
        "strengths": ["A document was submitted for review."] if not passed else ["The submitted document is readable and aligned with the stage deliverable."],
    }


@lru_cache(maxsize=1)
def _markitdown_converter() -> Any | None:
    if MarkItDown is None:
        return None
    try:
        return MarkItDown(enable_plugins=False)
    except Exception:
        return None


def _extract_markdown_with_markitdown(data: bytes, document_name: str, document_url: str) -> str:
    converter = _markitdown_converter()
    if converter is None or not data:
        return ""

    extension = Path(str(document_name or "")).suffix.lower()
    if not extension:
        extension = Path(urlparse(str(document_url or "")).path).suffix.lower()
    try:
        result = converter.convert_stream(
            io.BytesIO(data),
            file_extension=extension or None,
        )
        text = str(getattr(result, "text_content", "") or "").strip()
        return text[:MAX_DOCUMENT_CHARS]
    except Exception:
        return ""


def _extract_markdown_with_markitdown_details(data: bytes, document_name: str, document_url: str) -> dict[str, Any]:
    converter = _markitdown_converter()
    if converter is None:
        return {"parser": "markitdown", "success": False, "text": "", "error": "MarkItDown is unavailable."}
    if not data:
        return {"parser": "markitdown", "success": False, "text": "", "error": "Document response was empty."}

    extension = Path(str(document_name or "")).suffix.lower()
    if not extension:
        extension = Path(urlparse(str(document_url or "")).path).suffix.lower()
    try:
        result = converter.convert_stream(
            io.BytesIO(data),
            file_extension=extension or None,
        )
        text = str(getattr(result, "text_content", "") or "").strip()
        return {
            "parser": "markitdown",
            "success": bool(text),
            "text": text[:MAX_DOCUMENT_CHARS],
            "raw_char_count": len(text),
            "truncated": len(text) > MAX_DOCUMENT_CHARS,
            "error": "" if text else "MarkItDown returned empty text.",
        }
    except Exception as exc:
        return {"parser": "markitdown", "success": False, "text": "", "error": str(exc)}


def _extract_text_with_legacy_parsers(data: bytes, content_type: str, document_name: str, document_url: str) -> str:
    content_type = str(content_type or "").lower()
    name = str(document_name or document_url).lower()
    if "pdf" in content_type or name.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages[:12]]
            return "\n".join(pages)[:MAX_DOCUMENT_CHARS]
        except Exception:
            return ""

    if name.endswith(".docx") or "wordprocessingml" in content_type:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as docx:
                xml = docx.read("word/document.xml").decode("utf-8", errors="ignore")
            text = re.sub(r"<[^>]+>", " ", xml)
            return re.sub(r"\s+", " ", text).strip()[:MAX_DOCUMENT_CHARS]
        except Exception:
            return ""

    if (
        "text/" in content_type
        or name.endswith(".txt")
        or name.endswith(".md")
        or name.endswith(".csv")
        or name.endswith(".json")
    ):
        try:
            return data.decode("utf-8", errors="ignore")[:MAX_DOCUMENT_CHARS]
        except Exception:
            return ""

    return ""


def _extract_text_with_legacy_parser_details(data: bytes, content_type: str, document_name: str, document_url: str) -> dict[str, Any]:
    try:
        text = _extract_text_with_legacy_parsers(data, content_type, document_name, document_url)
        return {
            "parser": "legacy",
            "success": bool(str(text or "").strip()),
            "text": text,
            "raw_char_count": len(text or ""),
            "truncated": len(text or "") >= MAX_DOCUMENT_CHARS,
            "error": "" if str(text or "").strip() else "Legacy parser returned empty text.",
        }
    except Exception as exc:
        return {"parser": "legacy", "success": False, "text": "", "error": str(exc)}


def _optimize_review_text(text: str) -> str:
    value = str(text or "").replace("\x00", " ")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{4,}", "\n\n\n", value)
    value = re.sub(r"[ \t]{2,}", " ", value)
    return value.strip()


def _optimize_review_text_with_report(text: str) -> tuple[str, dict[str, Any]]:
    original = str(text or "")
    nul_count = original.count("\x00")
    trailing_space_lines = len(re.findall(r"[ \t]+\n", original))
    multi_newline_blocks = len(re.findall(r"\n{4,}", original))
    multi_space_blocks = len(re.findall(r"[ \t]{2,}", original))
    original_nonempty_lines = [line for line in original.splitlines() if line.strip()]

    no_nulls = original.replace("\x00", " ")
    no_trailing_spaces = re.sub(r"[ \t]+\n", "\n", no_nulls)
    normalized_newlines = re.sub(r"\n{4,}", "\n\n\n", no_trailing_spaces)
    normalized_spaces = re.sub(r"[ \t]{2,}", " ", normalized_newlines)
    stripped = normalized_spaces.strip()
    optimized = stripped[:MAX_DOCUMENT_CHARS]
    final_nonempty_lines = [line for line in optimized.splitlines() if line.strip()]

    original_headings = _extract_headings(original)
    final_headings = _extract_headings(optimized)
    original_tables = _count_markdown_tables(original)
    final_tables = _count_markdown_tables(optimized)
    report = {
        "removed_null_chars": nul_count,
        "removed_extra_spaces": multi_space_blocks > 0 or trailing_space_lines > 0,
        "normalized_newlines": multi_newline_blocks > 0,
        "removed_empty_lines": max(0, len(original.splitlines()) - len(original_nonempty_lines) - (len(optimized.splitlines()) - len(final_nonempty_lines))),
        "trimmed_outer_whitespace": original != original.strip(),
        "truncated": len(stripped) > MAX_DOCUMENT_CHARS,
        "original_chars": len(original),
        "post_normalization_chars": len(stripped),
        "final_chars": len(optimized),
        "original_word_count": _word_count(original),
        "final_word_count": _word_count(optimized),
        "tables_preserved": final_tables == original_tables,
        "headings_preserved": all(heading in final_headings for heading in original_headings[: len(final_headings)]),
        "original_tables_found": original_tables,
        "final_tables_found": final_tables,
        "original_headings_found": len(original_headings),
        "final_headings_found": len(final_headings),
    }
    return optimized, report


def _extract_headings(text: str) -> list[str]:
    headings: list[str] = []
    seen: set[str] = set()
    for line in str(text or "").splitlines():
        value = line.strip()
        if not value:
            continue
        cleaned = re.sub(r"^#{1,6}\s*", "", value).strip()
        is_markdown_heading = value.startswith("#")
        is_short_title = len(cleaned) <= 90 and re.match(r"^[A-Z][A-Za-z0-9 &,/():._-]{2,}$", cleaned)
        if not (is_markdown_heading or is_short_title):
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        headings.append(cleaned)
        if len(headings) >= 20:
            break
    return headings


def _count_markdown_tables(text: str) -> int:
    return len(re.findall(r"(?m)^\s*\|.+\|\s*$", str(text or "")))


def fetch_document_review_artifact(document_url: str, document_name: str = "") -> dict[str, Any]:
    artifact_started = time.perf_counter()
    execution_flow: list[dict[str, Any]] = []
    artifact = {
        "document_url": document_url or "",
        "document_name": document_name or "",
        "file_info": {
            "name": document_name or "",
            "type": "",
            "size_bytes": 0,
            "url": document_url or "",
        },
        "execution_flow": execution_flow,
        "parser_used": "",
        "parser_attempts": [],
        "parser_execution": {
            "markitdown_attempted": False,
            "markitdown_success": False,
            "markitdown_error": "",
            "fallback_used": False,
            "fallback_parser_name": "",
            "parser_used": "",
        },
        "markdown": "",
        "optimized_text": "",
        "optimization": {},
        "headings": [],
        "tables_found": 0,
        "images_found": 0,
        "extraction_statistics": {
            "markdown_length": 0,
            "text_length": 0,
            "word_count": 0,
            "headings_found": 0,
            "tables_found": 0,
            "images_found": 0,
        },
        "extraction_success": False,
        "validation": {
            "parser_executed": False,
            "markdown_not_empty": False,
            "text_exists": False,
            "minimum_content_met": False,
            "parser_error": "",
            "warnings": [],
        },
        "created_at": _utc_iso(),
    }
    if not document_url:
        step_started = time.perf_counter()
        step = _new_trace_step("file_fetch")
        execution_flow.append(_finish_trace_step(step, step_started, "FAILED", error="Document URL is missing."))
        artifact["validation"]["parser_error"] = "Document URL is missing."
        execution_flow.append(_finish_trace_step(_new_trace_step("markitdown_parse"), time.perf_counter(), "SKIPPED", warning="No document content was fetched."))
        execution_flow.append(_finish_trace_step(_new_trace_step("fallback_parse"), time.perf_counter(), "SKIPPED", warning="No document content was fetched."))
        execution_flow.append(_finish_trace_step(_new_trace_step("extraction_statistics"), time.perf_counter(), "SKIPPED", warning="No document content was fetched."))
        artifact["duration_ms"] = round((time.perf_counter() - artifact_started) * 1000, 2)
        return artifact

    fetch_started = time.perf_counter()
    fetch_step = _new_trace_step("file_fetch")
    try:
        response = requests.get(document_url, timeout=20)
        response.raise_for_status()
        execution_flow.append(_finish_trace_step(fetch_step, fetch_started, "SUCCESS"))
    except Exception as exc:
        first_error = str(exc)
        response = _fetch_s3_private_object(document_url)
        if response is None:
            execution_flow.append(_finish_trace_step(fetch_step, fetch_started, "FAILED", error=f"Public fetch failed: {first_error}; private S3 fetch failed."))
            artifact["validation"]["parser_error"] = "Could not fetch document content."
            execution_flow.append(_finish_trace_step(_new_trace_step("markitdown_parse"), time.perf_counter(), "SKIPPED", warning="No document content was fetched."))
            execution_flow.append(_finish_trace_step(_new_trace_step("fallback_parse"), time.perf_counter(), "SKIPPED", warning="No document content was fetched."))
            execution_flow.append(_finish_trace_step(_new_trace_step("extraction_statistics"), time.perf_counter(), "SKIPPED", warning="No document content was fetched."))
            artifact["duration_ms"] = round((time.perf_counter() - artifact_started) * 1000, 2)
            return artifact
        execution_flow.append(_finish_trace_step(fetch_step, fetch_started, "SUCCESS", warning=f"Public fetch failed: {first_error}; private S3 fetch succeeded."))

    content_type = str(response.headers.get("content-type") or "").lower()
    data = response.content or b""
    artifact["file_info"] = {
        "name": document_name or Path(urlparse(str(document_url or "")).path).name,
        "type": content_type,
        "size_bytes": len(data),
        "url": document_url or "",
    }

    markitdown_started = time.perf_counter()
    markitdown_step = _new_trace_step("markitdown_parse")
    artifact["parser_execution"]["markitdown_attempted"] = True
    markitdown = _extract_markdown_with_markitdown_details(data, document_name, document_url)
    artifact["parser_attempts"].append({k: v for k, v in markitdown.items() if k != "text"})
    markitdown_text = str(markitdown.get("text") or "").strip()
    markitdown_error = str(markitdown.get("error") or "")
    artifact["parser_execution"]["markitdown_success"] = bool(markitdown_text)
    artifact["parser_execution"]["markitdown_error"] = markitdown_error
    execution_flow.append(
        _finish_trace_step(
            markitdown_step,
            markitdown_started,
            "SUCCESS" if markitdown_text else "FAILED",
            warning="" if markitdown_text else "MarkItDown did not produce readable text; fallback parser will be used.",
            error=markitdown_error if not markitdown_text else "",
        )
    )
    selected = markitdown
    if not markitdown_text:
        fallback_started = time.perf_counter()
        fallback_step = _new_trace_step("fallback_parse")
        legacy = _extract_text_with_legacy_parser_details(data, content_type, document_name, document_url)
        artifact["parser_attempts"].append({k: v for k, v in legacy.items() if k != "text"})
        artifact["parser_execution"]["fallback_used"] = True
        artifact["parser_execution"]["fallback_parser_name"] = str(legacy.get("parser") or "legacy")
        legacy_text = str(legacy.get("text") or "").strip()
        execution_flow.append(
            _finish_trace_step(
                fallback_step,
                fallback_started,
                "SUCCESS" if legacy_text else "FAILED",
                error=str(legacy.get("error") or "") if not legacy_text else "",
            )
        )
        selected = legacy
    else:
        execution_flow.append(_finish_trace_step(_new_trace_step("fallback_parse"), time.perf_counter(), "SKIPPED", warning="MarkItDown produced readable text."))

    markdown = str(selected.get("text") or "").strip()
    optimized, optimization = _optimize_review_text_with_report(markdown)
    headings = _extract_headings(markdown)
    tables_found = _count_markdown_tables(markdown)
    images_found = _count_markdown_images(markdown)
    parser_used = selected.get("parser") or ""
    artifact["parser_execution"]["parser_used"] = parser_used
    artifact.update({
        "parser_used": parser_used,
        "markdown": markdown[:MAX_DOCUMENT_CHARS],
        "optimized_text": optimized,
        "optimization": optimization,
        "headings": headings,
        "tables_found": tables_found,
        "images_found": images_found,
        "extraction_statistics": {
            "markdown_length": len(markdown),
            "text_length": len(optimized),
            "word_count": _word_count(optimized),
            "headings_found": len(headings),
            "tables_found": tables_found,
            "images_found": images_found,
        },
        "extraction_success": bool(markdown),
    })
    extraction_warning = "Extracted text was truncated to the current review limit." if selected.get("truncated") else ""
    execution_flow.append(
        _finish_trace_step(
            _new_trace_step("extraction_statistics"),
            time.perf_counter(),
            "SUCCESS" if optimized else "FAILED",
            warning=extraction_warning,
            error="" if optimized else "No optimized text was produced.",
        )
    )
    artifact["validation"] = {
        "parser_executed": bool(selected.get("parser")),
        "markdown_not_empty": bool(markdown),
        "text_exists": bool(optimized),
        "minimum_content_met": len(optimized) >= 80,
        "validation_passed": bool(markdown) and bool(optimized) and len(optimized) >= 80,
        "parser_error": str(selected.get("error") or ""),
        "warnings": [
            warning
            for warning in [
                "Extracted text is short." if optimized and len(optimized) < 250 else "",
                "Extracted text was truncated to the current review limit." if selected.get("truncated") else "",
            ]
            if warning
        ],
    }
    execution_flow.append(
        _finish_trace_step(
            _new_trace_step("validation"),
            time.perf_counter(),
            "SUCCESS" if artifact["validation"]["validation_passed"] else "FAILED",
            warning="; ".join(artifact["validation"]["warnings"]),
            error=artifact["validation"]["parser_error"] if not artifact["validation"]["validation_passed"] else "",
        )
    )
    artifact["duration_ms"] = round((time.perf_counter() - artifact_started) * 1000, 2)
    return artifact


def fetch_document_text(document_url: str, document_name: str = "") -> str:
    if not document_url:
        return ""
    try:
        response = requests.get(document_url, timeout=20)
        response.raise_for_status()
    except Exception:
        response = _fetch_s3_private_object(document_url)
        if response is None:
            return ""

    content_type = str(response.headers.get("content-type") or "").lower()
    data = response.content or b""
    markdown_text = _extract_markdown_with_markitdown(data, document_name, document_url)
    if markdown_text.strip():
        return markdown_text
    return _extract_text_with_legacy_parsers(data, content_type, document_name, document_url)


def _aws_hmac(key: bytes | str, message: str, hex_digest: bool = False):
    raw_key = key.encode("utf-8") if isinstance(key, str) else key
    digest = hmac.new(raw_key, message.encode("utf-8"), hashlib.sha256).digest()
    return digest.hex() if hex_digest else digest


def _s3_signing_key(secret_access_key: str, date_stamp: str, region: str) -> bytes:
    date_key = _aws_hmac(f"AWS4{secret_access_key}", date_stamp)
    region_key = _aws_hmac(date_key, region)
    service_key = _aws_hmac(region_key, "s3")
    return _aws_hmac(service_key, "aws4_request")


def _fetch_s3_private_object(document_url: str):
    settings = get_settings()
    if not (settings.aws_access_key_id and settings.aws_secret_access_key and settings.aws_region and settings.aws_bucket_name):
        return None

    parsed = urlparse(str(document_url or ""))
    expected_host = f"{settings.aws_bucket_name}.s3.{settings.aws_region}.amazonaws.com"
    if parsed.netloc.lower() != expected_host.lower():
        return None

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    credential_scope = f"{date_stamp}/{settings.aws_region}/s3/aws4_request"
    payload_hash = hashlib.sha256(b"").hexdigest()
    canonical_uri = quote(parsed.path or "/", safe="/%")
    canonical_headers = (
        f"host:{expected_host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join([
        "GET",
        canonical_uri,
        parsed.query or "",
        canonical_headers,
        signed_headers,
        payload_hash,
    ])
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signature = _aws_hmac(
        _s3_signing_key(settings.aws_secret_access_key, date_stamp, settings.aws_region),
        string_to_sign,
        hex_digest=True,
    )
    authorization = (
        f"AWS4-HMAC-SHA256 Credential={settings.aws_access_key_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    try:
        response = requests.get(
            document_url,
            timeout=20,
            headers={
                "Authorization": authorization,
                "x-amz-content-sha256": payload_hash,
                "x-amz-date": amz_date,
            },
        )
        response.raise_for_status()
        return response
    except Exception:
        return None


def _document_items(payload: dict[str, Any]) -> list[dict[str, str]]:
    seen: set[str] = set()
    items: list[dict[str, str]] = []
    for item in payload.get("documents") or []:
        if not isinstance(item, dict):
            continue
        url = str(item.get("document_url") or item.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        items.append({
            "document_url": url,
            "document_name": str(item.get("document_name") or item.get("name") or url).strip(),
        })

    legacy_url = str(payload.get("document_url") or "").strip()
    if legacy_url and legacy_url not in seen:
        items.append({
            "document_url": legacy_url,
            "document_name": str(payload.get("document_name") or legacy_url).strip(),
        })
    return items


def fetch_documents_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    remaining = MAX_DOCUMENT_CHARS
    for index, item in enumerate(_document_items(payload), start=1):
        if remaining <= 0:
            break
        name = item["document_name"] or f"Document {index}"
        text = fetch_document_text(item["document_url"], name)
        if not text.strip():
            continue
        section = f"## Document {index}: {name}\n{text.strip()}"
        parts.append(section[:remaining])
        remaining = MAX_DOCUMENT_CHARS - sum(len(part) + 2 for part in parts)
    return "\n\n".join(parts)[:MAX_DOCUMENT_CHARS]


def build_stage_document_review_artifacts(payload: dict[str, Any]) -> dict[str, Any]:
    artifacts_started = time.perf_counter()
    execution_flow: list[dict[str, Any]] = []
    document_items = _document_items(payload)
    document_collection_step = _new_trace_step("collect_document_inputs")
    document_artifacts: list[dict[str, Any]] = []
    markdown_parts: list[str] = []
    optimized_parts: list[str] = []
    remaining = MAX_DOCUMENT_CHARS
    execution_flow.append(
        _finish_trace_step(
            document_collection_step,
            artifacts_started,
            "SUCCESS" if document_items else "FAILED",
            error="" if document_items else "No document URLs were provided to the review pipeline.",
        )
    )
    for index, item in enumerate(document_items, start=1):
        if remaining <= 0:
            execution_flow.append(
                _finish_trace_step(
                    _new_trace_step(f"document_{index}_parse"),
                    time.perf_counter(),
                    "SKIPPED",
                    warning="Document character budget was exhausted before this document was parsed.",
                )
            )
            break
        name = item["document_name"] or f"Document {index}"
        parse_started = time.perf_counter()
        parse_step = _new_trace_step(f"document_{index}_parse")
        artifact = fetch_document_review_artifact(item["document_url"], name)
        artifact["index"] = index
        document_artifacts.append(artifact)
        execution_flow.append(
            _finish_trace_step(
                parse_step,
                parse_started,
                "SUCCESS" if artifact.get("extraction_success") else "FAILED",
                warning="; ".join((artifact.get("validation") or {}).get("warnings") or []),
                error=(artifact.get("validation") or {}).get("parser_error") or "",
            )
        )
        text = str(artifact.get("optimized_text") or "").strip()
        markdown = str(artifact.get("markdown") or "").strip()
        if not text:
            execution_flow.append(
                _finish_trace_step(
                    _new_trace_step(f"document_{index}_append_to_prompt_context"),
                    time.perf_counter(),
                    "SKIPPED",
                    warning="Document produced no optimized text.",
                )
            )
            continue
        append_started = time.perf_counter()
        optimized_section = f"## Document {index}: {name}\n{text}"
        markdown_section = f"## Document {index}: {name}\n{markdown}"
        optimized_parts.append(optimized_section[:remaining])
        markdown_parts.append(markdown_section[:remaining])
        remaining = MAX_DOCUMENT_CHARS - sum(len(part) + 2 for part in optimized_parts)
        execution_flow.append(
            _finish_trace_step(
                _new_trace_step(f"document_{index}_append_to_prompt_context"),
                append_started,
                "SUCCESS",
                warning="Document text was clipped to fit review character budget." if len(optimized_section) > remaining else "",
            )
        )

    optimized_document_text = "\n\n".join(optimized_parts)[:MAX_DOCUMENT_CHARS]
    raw_markdown = "\n\n".join(markdown_parts)[:MAX_DOCUMENT_CHARS]
    headings_found = sum(len(item.get("headings") or []) for item in document_artifacts)
    tables_found = sum(int(item.get("tables_found") or 0) for item in document_artifacts)
    images_found = sum(int(item.get("images_found") or 0) for item in document_artifacts)
    optimization_reports = [item.get("optimization") or {} for item in document_artifacts]
    truncation_applied = any(
        bool((attempt or {}).get("truncated"))
        for item in document_artifacts
        for attempt in (item.get("parser_attempts") or [])
    ) or any(bool(item.get("truncated")) for item in optimization_reports) or len("\n\n".join(optimized_parts)) > MAX_DOCUMENT_CHARS
    optimization = {
        "documents_processed": len(document_artifacts),
        "removed_extra_spaces": any(bool(item.get("removed_extra_spaces")) for item in optimization_reports),
        "normalized_newlines": any(bool(item.get("normalized_newlines")) for item in optimization_reports),
        "removed_empty_lines": sum(int(item.get("removed_empty_lines") or 0) for item in optimization_reports),
        "removed_null_chars": sum(int(item.get("removed_null_chars") or 0) for item in optimization_reports),
        "truncated": truncation_applied,
        "original_chars": sum(int(item.get("original_chars") or 0) for item in optimization_reports),
        "post_normalization_chars": sum(int(item.get("post_normalization_chars") or 0) for item in optimization_reports),
        "final_chars": len(optimized_document_text),
        "tables_preserved": all(bool(item.get("tables_preserved", True)) for item in optimization_reports),
        "headings_preserved": all(bool(item.get("headings_preserved", True)) for item in optimization_reports),
        "per_document": optimization_reports,
    }
    estimated_tokens = max(1, len(optimized_document_text) // 4) if optimized_document_text else 0
    oversized_documents = []
    for item in document_artifacts:
        stats = item.get("extraction_statistics") or {}
        extracted_chars = max(int(stats.get("markdown_length") or 0), int(stats.get("text_length") or 0))
        if extracted_chars > MAX_UPLOADED_DOCUMENT_CHARS:
            oversized_documents.append({
                "index": item.get("index"),
                "document_name": item.get("document_name") or (item.get("file_info") or {}).get("name") or "Document",
                "extracted_chars": extracted_chars,
                "max_allowed_chars": MAX_UPLOADED_DOCUMENT_CHARS,
            })
    validation_warnings = [
        warning
        for item in document_artifacts
        for warning in ((item.get("validation") or {}).get("warnings") or [])
    ]
    if oversized_documents:
        validation_warnings.append(
            f"One or more uploaded documents exceeded {MAX_UPLOADED_DOCUMENT_CHARS} extracted characters."
        )
    validation = {
        "documents_seen": len(document_artifacts),
        "documents_extracted": sum(1 for item in document_artifacts if item.get("extraction_success")),
        "passed": bool(optimized_document_text.strip()) and not oversized_documents,
        "markdown_not_empty": bool(raw_markdown.strip()),
        "text_exists": bool(optimized_document_text.strip()),
        "minimum_content_met": len(optimized_document_text.strip()) >= 80,
        "oversized_documents": oversized_documents,
        "max_uploaded_document_chars": MAX_UPLOADED_DOCUMENT_CHARS,
        "validation_passed": bool(optimized_document_text.strip()) and len(optimized_document_text.strip()) >= 80 and not oversized_documents,
        "warnings": validation_warnings,
    }
    token_analysis = {
        "estimated_input_tokens": estimated_tokens,
        "max_allowed_tokens": MAX_ALLOWED_INPUT_TOKENS,
        "within_limit": estimated_tokens <= MAX_ALLOWED_INPUT_TOKENS,
        "truncation_applied": truncation_applied,
        "max_document_chars": MAX_DOCUMENT_CHARS,
        "max_uploaded_document_chars": MAX_UPLOADED_DOCUMENT_CHARS,
        "oversized_documents": oversized_documents,
    }
    execution_flow.append(
        _finish_trace_step(
            _new_trace_step("token_analysis"),
            time.perf_counter(),
            "SUCCESS" if token_analysis["within_limit"] else "FAILED",
            warning="Input was truncated before prompt generation." if truncation_applied else "",
            error="" if token_analysis["within_limit"] else "Estimated tokens exceed configured input limit.",
        )
    )
    return {
        "execution_flow": execution_flow,
        "documents": document_artifacts,
        "raw_markdown": raw_markdown,
        "optimized_document_text": optimized_document_text,
        "validation": validation,
        "optimization": optimization,
        "extraction_statistics": {
            "markdown_length": len(raw_markdown),
            "text_length": len(optimized_document_text),
            "word_count": _word_count(optimized_document_text),
            "headings_found": headings_found,
            "tables_found": tables_found,
            "images_found": images_found,
        },
        "token_analysis": token_analysis,
        "estimated_input_tokens": estimated_tokens,
        "max_document_chars": MAX_DOCUMENT_CHARS,
        "duration_ms": round((time.perf_counter() - artifacts_started) * 1000, 2),
    }


def _build_review_source_trace(
    payload: dict[str, Any],
    artifacts: dict[str, Any],
    prompt_input: dict[str, Any] | None = None,
    prompt: str = "",
) -> dict[str, Any]:
    documents = artifacts.get("documents") or []
    rag_context = payload.get("rag_context") if isinstance(payload.get("rag_context"), dict) else {}
    rag_chunks = rag_context.get("chunks") if isinstance(rag_context, dict) else []
    rag_chunks = rag_chunks if isinstance(rag_chunks, list) else []
    rag_documents = rag_context.get("documents") if isinstance(rag_context, dict) else []
    rag_documents = rag_documents if isinstance(rag_documents, list) else []
    rag_retrieval_trace = payload.get("rag_retrieval_trace") if isinstance(payload.get("rag_retrieval_trace"), dict) else {}
    optimized_text = str(artifacts.get("optimized_document_text") or "")
    raw_markdown = str(artifacts.get("raw_markdown") or "")
    return {
        "rag_used": bool(rag_chunks),
        "rag_retrieved_chunks": len(rag_chunks),
        "rag_source_documents": rag_documents,
        "rag_chunks": [
            {
                "score": chunk.get("score"),
                "chunk_id": chunk.get("chunk_id"),
                "chunk_index": chunk.get("chunk_index"),
                "document_id": chunk.get("document_id"),
                "document_title": chunk.get("document_title"),
                "document_type": chunk.get("document_type"),
                "content_chars": len(str(chunk.get("content") or "")),
                "preview": str(chunk.get("content") or "")[:500],
            }
            for chunk in rag_chunks
            if isinstance(chunk, dict)
        ],
        "rag_context_chars": len(str(rag_context.get("context_text") or "")) if isinstance(rag_context, dict) else 0,
        "rag_retrieval_trace": rag_retrieval_trace,
        "rag_error": str(payload.get("rag_error") or ""),
        "rag_reason": (
            "Retrieved project document chunks were added to the review prompt."
            if rag_chunks
            else "No project document chunks were retrieved for this review prompt."
        ),
        "project_context_sources": [
            {"field": "project_name", "source": "review request payload / workspace selected project", "value": payload.get("project_name")},
            {"field": "step_number", "source": "review request payload / workspace selected step", "value": payload.get("step_number")},
            {"field": "stage_index", "source": "review request payload / workspace selected stage", "value": payload.get("stage_index")},
            {"field": "stage_title", "source": "review request payload / project methodology from database", "value": payload.get("stage_title")},
            {"field": "objective", "source": "review request payload / project methodology from database", "value": payload.get("objective")},
            {"field": "deliverable", "source": "review request payload / project methodology from database", "value": payload.get("deliverable")},
            {"field": "stage_context", "source": "review request payload / project methodology from database", "value": payload.get("stage_context")},
            {"field": "document_name", "source": "review request payload / uploaded document metadata", "value": payload.get("document_name")},
        ],
        "document_sources": [
            {
                "index": item.get("index"),
                "name": (item.get("file_info") or {}).get("name") or item.get("document_name") or "",
                "url": (item.get("file_info") or {}).get("url") or item.get("document_url") or "",
                "type": (item.get("file_info") or {}).get("type") or "",
                "size_bytes": (item.get("file_info") or {}).get("size_bytes") or 0,
                "parser_used": item.get("parser_used") or (item.get("parser_execution") or {}).get("parser_used") or "",
                "markitdown_attempted": bool((item.get("parser_execution") or {}).get("markitdown_attempted")),
                "markitdown_success": bool((item.get("parser_execution") or {}).get("markitdown_success")),
                "fallback_used": bool((item.get("parser_execution") or {}).get("fallback_used")),
                "raw_markdown_chars": len(str(item.get("markdown") or "")),
                "optimized_text_chars": len(str(item.get("optimized_text") or "")),
                "used_in_prompt_context": bool(str(item.get("optimized_text") or "").strip()),
                "source_table": "project_stage_documents",
            }
            for item in documents
            if isinstance(item, dict)
        ],
        "prompt_context_sources": [
            {"field": "document_excerpt", "source": "optimized_text from uploaded document parser output", "chars": len(str((prompt_input or {}).get("document_excerpt") or optimized_text))},
            {"field": "allowed_project_context", "source": "RAG retrieval from indexed project document_chunks", "chunks": len(rag_chunks), "chars": len(str(rag_context.get("context_text") or "")) if isinstance(rag_context, dict) else 0},
            {"field": "project/stage fields", "source": "prompt_input copied from review request payload", "chars": len(json.dumps(prompt_input or {}, ensure_ascii=False, default=str))},
            {"field": "full_prompt", "source": "prompt template plus prompt_input fields, RAG context, and optimized document text", "chars": len(str(prompt or ""))},
        ],
        "stored_text_fields": {
            "raw_markdown": "Concatenated markdown/text extracted from uploaded documents before optimization.",
            "optimized_text": "Normalized document text used for document_excerpt in the final prompt.",
            "rag_context": "Retrieved indexed project document chunks added to the final prompt when available.",
            "prompt_input": "Structured JSON input used to build the final prompt.",
            "full_prompt": "Exact final prompt sent to the LLM, or generated then skipped in no-LLM test mode.",
            "llm_raw_output": "Raw model response when an LLM call is sent; empty when skipped or unavailable.",
        },
        "character_counts": {
            "raw_markdown_chars": len(raw_markdown),
            "optimized_text_chars": len(optimized_text),
            "prompt_input_json_chars": len(json.dumps(prompt_input or {}, ensure_ascii=False, default=str)),
            "full_prompt_chars": len(str(prompt or "")),
        },
    }


def _normalize_review(raw: dict[str, Any]) -> dict[str, Any]:
    score = int(raw.get("score") or 0)
    score = max(0, min(100, score))
    status = "pass" if str(raw.get("status") or "").lower() == "pass" or score >= PASSING_SCORE else "fail"
    feedback = str(raw.get("safe_student_feedback") or raw.get("feedback") or "").strip()
    if not feedback:
        feedback = "Document review passed." if status == "pass" else "Document review needs revision before this stage can be completed."
    return {
        "status": status,
        "score": score,
        "passing_score": PASSING_SCORE,
        "safe_student_feedback": feedback,
        "missing_items": [str(item) for item in (raw.get("missing_items") or []) if item],
        "weak_areas": [str(item) for item in (raw.get("weak_areas") or []) if item],
        "strengths": [str(item) for item in (raw.get("strengths") or []) if item],
    }


def _public_ai_detection(ai_detection: dict[str, Any]) -> dict[str, Any]:
    return {
        "probability": ai_detection.get("ai_probability", 0),
        "confidence": ai_detection.get("confidence", 0),
        "status": ai_detection.get("status", ""),
        "warning": ai_detection.get("warning_message", ""),
        "reasons": ai_detection.get("reasons", []),
    }


def _run_ai_content_detection(document_text: str, payload: dict[str, Any]) -> dict[str, Any]:
    async def _detect():
        return await detect_ai_content(
            document_text,
            user_id=int(payload.get("user_id") or 0),
            project_id=int(payload.get("project_id") or 0),
            stage_id=int(payload.get("stage_id") or payload.get("stage_index") or 0),
        )

    try:
        result = asyncio.run(_detect())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(_detect())
        finally:
            loop.close()
    return result.to_dict()


def _call_direct_llm_stage_review(prompt: str, payload: dict[str, Any]) -> str | None:
    """Call LLM directly (bypassing CrewAI) so token usage is always captured."""
    settings = get_settings()
    provider = "openai"
    try:
        if not settings.openai_api_key:
            return None
        from langchain_openai import ChatOpenAI
        model = _openai_review_model(settings)
        chat = ChatOpenAI(
            model=model,
            api_key=settings.openai_api_key,
            temperature=0.2,
            max_retries=0,
        )
        response = chat.invoke(prompt)
        usage = extract_usage_metadata(response)
        if usage:
            record_ai_usage_event(
                provider=provider,
                model=model,
                feature="stage_document_review",
                route="backend.app.services.stage_document_review._call_direct_llm_stage_review",
                user_id=int(payload.get("user_id") or 0) or None,
                project_name=str(payload.get("project_name") or ""),
                usage={
                    **usage,
                    "prompt_chars": len(prompt),
                    "prompt_estimated_tokens": max(1, len(prompt) // 4),
                },
            )
        content = getattr(response, "content", response)
        if isinstance(content, list):
            content = "\n".join(str(item) for item in content if item)
        return str(content).strip() or None
    except Exception:
        logger.exception("Direct LLM stage document review call failed.")
        return None


def run_stage_document_review(payload: dict[str, Any]) -> dict[str, Any]:
    review_started = time.perf_counter()
    settings = get_settings()
    artifacts = payload.get("prebuilt_artifacts") if isinstance(payload.get("prebuilt_artifacts"), dict) else build_stage_document_review_artifacts(payload)
    rag_retrieval_trace = payload.get("rag_retrieval_trace")
    if isinstance(rag_retrieval_trace, dict):
        artifacts["execution_flow"] = [rag_retrieval_trace, *(artifacts.get("execution_flow") or [])]
    artifacts["source_trace"] = _build_review_source_trace(payload, artifacts)
    execution_flow = list(artifacts.get("execution_flow") or [])
    document_text = artifacts["optimized_document_text"]
    if not document_text.strip():
        normalized = _normalize_review({
            "status": "fail",
            "score": 25,
            "safe_student_feedback": (
                "Document review needs revision. I could not read the submitted file content. "
                "Please upload a readable PDF, text, or markdown document so I can review it against the stage deliverable."
            ),
            "missing_items": ["Readable document content"],
            "weak_areas": ["The uploaded file could not be parsed for review."],
            "strengths": ["The file reached Cloudinary successfully."],
        })
        normalized["_audit"] = {
            **artifacts,
            "execution_flow": [
                *execution_flow,
                _finish_trace_step(_new_trace_step("prompt_generation"), time.perf_counter(), "SKIPPED", warning="Validation failed before prompt generation."),
                _finish_trace_step(_new_trace_step("llm_execution"), time.perf_counter(), "SKIPPED", warning="Validation failed before LLM execution."),
                _finish_trace_step(_new_trace_step("decision"), time.perf_counter(), "SUCCESS", warning="Rejected because no readable document text was available."),
            ],
            "prompt": "",
            "prompt_input": {},
            "prompt_generation": {
                "prompt_version": PROMPT_VERSION,
                "prompt_size": 0,
                "prompt_preview": "",
            },
            "llm_execution": {
                "review_source": "validation_failure",
                "model": "",
                "request_sent": False,
                "max_retries": 0,
                "raw_response": "",
                "parsing_status": "SKIPPED",
                "timeout_or_error": "Validation failed before LLM execution.",
            },
            "decision": {
                "score": normalized["score"],
                "pass_threshold": PASSING_SCORE,
                "approved": False,
                "reason": "No readable document text was available.",
            },
            "llm_raw_output": "",
            "normalized_review": {k: v for k, v in normalized.items() if k != "_audit"},
            "review_source": "validation_failure",
            "duration_ms": round((time.perf_counter() - review_started) * 1000, 2),
        }
        return normalized

    if len(document_text.strip()) < 80:
        normalized = _normalize_review({
            "status": "fail",
            "score": 30,
            "safe_student_feedback": (
                "Document review needs revision. The submitted file has too little readable content to review against "
                "the stage deliverable. Please upload a complete document with the required sections and project details."
            ),
            "missing_items": ["Enough readable content for review"],
            "weak_areas": ["The uploaded file content is too short for a reliable stage review."],
            "strengths": ["The file was uploaded successfully."],
        })
        normalized["_audit"] = {
            **artifacts,
            "execution_flow": [
                *execution_flow,
                _finish_trace_step(_new_trace_step("prompt_generation"), time.perf_counter(), "SKIPPED", warning="Validation failed because extracted text is too short."),
                _finish_trace_step(_new_trace_step("llm_execution"), time.perf_counter(), "SKIPPED", warning="Validation failed before LLM execution."),
                _finish_trace_step(_new_trace_step("decision"), time.perf_counter(), "SUCCESS", warning="Rejected because extracted text is too short."),
            ],
            "prompt": "",
            "prompt_input": {},
            "prompt_generation": {
                "prompt_version": PROMPT_VERSION,
                "prompt_size": 0,
                "prompt_preview": "",
            },
            "llm_execution": {
                "review_source": "validation_failure_short_content",
                "model": "",
                "request_sent": False,
                "max_retries": 0,
                "raw_response": "",
                "parsing_status": "SKIPPED",
                "timeout_or_error": "Validation failed before LLM execution.",
            },
            "decision": {
                "score": normalized["score"],
                "pass_threshold": PASSING_SCORE,
                "approved": False,
                "reason": "Extracted document text is too short for review.",
            },
            "llm_raw_output": "",
            "normalized_review": {k: v for k, v in normalized.items() if k != "_audit"},
            "review_source": "validation_failure_short_content",
            "duration_ms": round((time.perf_counter() - review_started) * 1000, 2),
        }
        return normalized

    ai_detection_started = time.perf_counter()
    ai_detection_step = _new_trace_step("ai_content_detection")
    try:
        ai_detection = _run_ai_content_detection(document_text, payload)
        ai_detection_status = str(ai_detection.get("status") or "").strip().upper()
        execution_flow.append(
            _finish_trace_step(
                ai_detection_step,
                ai_detection_started,
                "REJECTED" if ai_detection_status == "REJECTED" else "SUCCESS",
                warning=str(ai_detection.get("warning_message") or ""),
            )
        )
    except Exception as exc:
        logger.exception("AI content detection failed; continuing existing document review pipeline.")
        ai_detection = {
            "ai_probability": 0,
            "confidence": 0,
            "status": "UNAVAILABLE",
            "warning_message": "AI content detection could not be completed, so the document review continued normally.",
            "reasons": [str(exc)],
            "raw_detector_response": {"error": str(exc)},
        }
        ai_detection_status = "UNAVAILABLE"
        execution_flow.append(
            _finish_trace_step(
                ai_detection_step,
                ai_detection_started,
                "FAILED",
                warning=ai_detection["warning_message"],
                error=str(exc),
            )
        )
    artifacts["ai_detection"] = ai_detection
    artifacts["execution_flow"] = execution_flow
    artifacts["source_trace"] = _build_review_source_trace(payload, artifacts)
    if ai_detection_status == "REJECTED":
        public_detection = _public_ai_detection(ai_detection)
        message = (
            "Your document was rejected by AI content detection before mentor review. "
            "Please revise the document in your own words and submit it again."
        )
        return {
            "status": "REJECTED",
            "message": message,
            "ai_detection": public_detection,
            "_audit": {
                **artifacts,
                "execution_flow": [
                    *execution_flow,
                    _finish_trace_step(_new_trace_step("prompt_generation"), time.perf_counter(), "SKIPPED", warning="AI content detection rejected the submission before prompt generation."),
                    _finish_trace_step(_new_trace_step("llm_execution"), time.perf_counter(), "SKIPPED", warning="AI content detection rejected the submission before LLM execution."),
                    _finish_trace_step(_new_trace_step("decision"), time.perf_counter(), "REJECTED", warning=message),
                ],
                "prompt": "",
                "prompt_input": {},
                "prompt_generation": {
                    "prompt_version": PROMPT_VERSION,
                    "prompt_size": 0,
                    "prompt_preview": "",
                },
                "llm_execution": {
                    "review_source": "ai_content_detection_rejection",
                    "model": "",
                    "request_sent": False,
                    "max_retries": 0,
                    "raw_response": "",
                    "parsing_status": "SKIPPED",
                    "timeout_or_error": "AI content detection rejected the submission before LLM execution.",
                },
                "decision": {
                    "approved": False,
                    "reason": message,
                    "ai_detection_status": ai_detection_status,
                    "ai_probability": ai_detection.get("ai_probability", 0),
                },
                "llm_raw_output": "",
                "normalized_review": {},
                "review_source": "ai_content_detection_rejection",
                "duration_ms": round((time.perf_counter() - review_started) * 1000, 2),
            },
        }

    prompt_started = time.perf_counter()
    rag_context = payload.get("rag_context") if isinstance(payload.get("rag_context"), dict) else {}
    rag_context_text = str(rag_context.get("context_text") or "").strip()
    rag_chunks = rag_context.get("chunks") if isinstance(rag_context, dict) else []
    rag_chunks = rag_chunks if isinstance(rag_chunks, list) else []
    rag_prompt_input = {
        "used": bool(rag_chunks),
        "retrieved_chunks": len(rag_chunks),
        "documents": rag_context.get("documents") or [],
        "chunks": [
            {
                "score": chunk.get("score"),
                "chunk_id": chunk.get("chunk_id"),
                "chunk_index": chunk.get("chunk_index"),
                "document_id": chunk.get("document_id"),
                "document_title": chunk.get("document_title"),
                "document_type": chunk.get("document_type"),
                "content": chunk.get("content"),
            }
            for chunk in rag_chunks
            if isinstance(chunk, dict)
        ],
    }
    prompt_input = {
        "project_name": payload.get("project_name"),
        "step_number": payload.get("step_number"),
        "stage_index": payload.get("stage_index"),
        "stage_title": payload.get("stage_title"),
        "objective": payload.get("objective"),
        "deliverable": payload.get("deliverable"),
        "stage_context": payload.get("stage_context"),
        "document_name": payload.get("document_name"),
        "rag_context": rag_prompt_input,
        "document_excerpt": document_text[:MAX_DOCUMENT_CHARS],
    }
    prompt = (
        "You are reviewing a student's uploaded stage document. Evaluate only against the current stage deliverable, "
        "objective, stage context, and allowed project document context. Do not reveal any official/private solution. Return valid JSON only.\n\n"
        "JSON schema: {\"status\":\"pass|fail\",\"score\":0,\"safe_student_feedback\":\"short mentor feedback\","
        "\"missing_items\":[],\"weak_areas\":[],\"strengths\":[]}\n\n"
        f"Project: {payload.get('project_name')}\n"
        f"Step: {payload.get('step_number')}\n"
        f"Stage title: {payload.get('stage_title')}\n"
        f"Objective: {payload.get('objective')}\n"
        f"Deliverable: {payload.get('deliverable')}\n"
        f"Stage context: {payload.get('stage_context')}\n"
        f"Document name: {payload.get('document_name')}\n\n"
        f"Allowed Project/RAG Context:\n{rag_context_text or 'No RAG chunks were retrieved for this review.'}\n\n"
        f"Document Markdown/text excerpt:\n{document_text[:MAX_DOCUMENT_CHARS]}"
    )
    artifacts["source_trace"] = _build_review_source_trace(payload, artifacts, prompt_input, prompt)
    prompt_generation = {
        "prompt_version": PROMPT_VERSION,
        "prompt_format": "plain_text_prompt_with_json_output_instruction",
        "prompt_input_format": "stored_json_metadata_not_sent_as_raw_json",
        "prompt_size": len(prompt),
        "full_prompt_estimated_tokens": max(1, len(prompt) // 4),
        "document_excerpt_chars": len(str(prompt_input.get("document_excerpt") or "")),
        "rag_context_chars": len(rag_context_text),
        "prompt_input_json_chars": len(json.dumps(prompt_input or {}, ensure_ascii=False, default=str)),
        "prompt_preview": _prompt_preview(prompt),
        "prompt_input": prompt_input,
    }
    execution_flow.append(
        _finish_trace_step(
            _new_trace_step("prompt_generation"),
            prompt_started,
            "SUCCESS",
            warning="Prompt was generated from truncated document text." if (artifacts.get("token_analysis") or {}).get("truncation_applied") else "",
        )
    )
    llm_started = time.perf_counter()
    model = _openai_review_model(settings) if settings.openai_api_key else ""
    raw_direct = _call_direct_llm_stage_review(prompt, payload)
    review_source = "direct_llm"
    request_sent = bool(settings.openai_api_key)
    if raw_direct:
        parsing_started = time.perf_counter()
        try:
            start = raw_direct.find("{")
            end = raw_direct.rfind("}") + 1
            if start != -1 and end > start:
                parsed = json.loads(raw_direct[start:end])
                parsing_status = "SUCCESS"
                parsing_error = ""
            else:
                parsed = _fallback_review(payload, document_text)
                review_source = "fallback_after_invalid_json"
                parsing_status = "FAILED"
                parsing_error = "LLM response did not contain a JSON object."
        except (json.JSONDecodeError, ValueError):
            parsed = _fallback_review(payload, document_text)
            review_source = "fallback_after_invalid_json"
            parsing_status = "FAILED"
            parsing_error = "LLM response JSON parsing failed."
        normalized = _normalize_review(parsed)
        normalized["ai_detection"] = _public_ai_detection(ai_detection)
        decision = {
            "score": normalized["score"],
            "pass_threshold": PASSING_SCORE,
            "approved": normalized["status"] == "pass",
            "reason": normalized["safe_student_feedback"],
        }
        normalized["_audit"] = {
            **artifacts,
            "execution_flow": [
                *execution_flow,
                _finish_trace_step(_new_trace_step("llm_execution"), llm_started, "SUCCESS", warning="" if review_source == "direct_llm" else "LLM returned invalid JSON; fallback decision was used."),
                _finish_trace_step(_new_trace_step("llm_response_parsing"), parsing_started, parsing_status, error=parsing_error),
                _finish_trace_step(_new_trace_step("decision"), time.perf_counter(), "SUCCESS", warning=decision["reason"]),
            ],
            "prompt": prompt,
            "prompt_input": prompt_input,
            "prompt_generation": prompt_generation,
            "llm_execution": {
                "review_source": review_source,
                "model": model,
                "request_sent": request_sent,
                "max_retries": 0,
                "raw_response": raw_direct,
                "parsing_status": parsing_status,
                "timeout_or_error": parsing_error,
            },
            "decision": decision,
            "llm_raw_output": raw_direct,
            "normalized_review": {k: v for k, v in normalized.items() if k != "_audit"},
            "review_source": review_source,
            "duration_ms": round((time.perf_counter() - review_started) * 1000, 2),
        }
        return normalized
    normalized = _normalize_review(_fallback_review(payload, document_text))
    normalized["ai_detection"] = _public_ai_detection(ai_detection)
    error_message = "OpenAI API key is missing." if not settings.openai_api_key else "LLM call returned no response; see server logs for timeout or provider error."
    decision = {
        "score": normalized["score"],
        "pass_threshold": PASSING_SCORE,
        "approved": normalized["status"] == "pass",
        "reason": "Fallback review used after LLM call did not return a usable response.",
    }
    normalized["_audit"] = {
        **artifacts,
        "execution_flow": [
            *execution_flow,
            _finish_trace_step(_new_trace_step("llm_execution"), llm_started, "FAILED", error=error_message),
            _finish_trace_step(_new_trace_step("llm_response_parsing"), time.perf_counter(), "SKIPPED", warning="No raw LLM response was available to parse."),
            _finish_trace_step(_new_trace_step("decision"), time.perf_counter(), "SUCCESS", warning=decision["reason"]),
        ],
        "prompt": prompt,
        "prompt_input": prompt_input,
        "prompt_generation": prompt_generation,
        "llm_execution": {
            "review_source": "fallback_after_llm_failure",
            "model": model,
            "request_sent": request_sent,
            "max_retries": 0,
            "raw_response": "",
            "parsing_status": "SKIPPED",
            "timeout_or_error": error_message,
        },
        "decision": decision,
        "llm_raw_output": "",
        "normalized_review": {k: v for k, v in normalized.items() if k != "_audit"},
        "review_source": "fallback_after_llm_failure",
        "duration_ms": round((time.perf_counter() - review_started) * 1000, 2),
    }
    return normalized
