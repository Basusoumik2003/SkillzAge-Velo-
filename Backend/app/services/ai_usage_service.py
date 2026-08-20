"""Records LLM token-usage events into the `ai_usage_events` table (see
Backend/sql/migrations/2026-06-25_01_ai_usage_events.sql) and extracts a
normalized usage dict from a LangChain chat response.

This is best-effort telemetry: a failure here must never break the caller's
actual LLM/embedding call, so every DB write is wrapped and swallows errors
(logged, not raised).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text

logger = logging.getLogger(__name__)


def extract_usage_metadata(response: Any) -> dict[str, int]:
    """Pull prompt/completion/total token counts out of a LangChain chat
    response (AIMessage). Handles both the modern `usage_metadata` shape
    and the older `response_metadata['token_usage']` shape. Returns an
    empty dict if no usage info is present (caller should skip logging)."""
    usage_metadata = getattr(response, "usage_metadata", None) or {}
    if usage_metadata:
        prompt_tokens = int(usage_metadata.get("input_tokens") or 0)
        completion_tokens = int(usage_metadata.get("output_tokens") or 0)
        total_tokens = int(usage_metadata.get("total_tokens") or (prompt_tokens + completion_tokens))
        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "input_tokens": prompt_tokens,
            "output_tokens": completion_tokens,
        }

    response_metadata = getattr(response, "response_metadata", None) or {}
    token_usage = response_metadata.get("token_usage") or {}
    if token_usage:
        prompt_tokens = int(token_usage.get("prompt_tokens") or 0)
        completion_tokens = int(token_usage.get("completion_tokens") or 0)
        total_tokens = int(token_usage.get("total_tokens") or (prompt_tokens + completion_tokens))
        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "input_tokens": prompt_tokens,
            "output_tokens": completion_tokens,
        }

    return {}


def record_ai_usage_event(
    *,
    provider: str,
    model: str,
    feature: str,
    route: str = "",
    user_id: int | str | None = None,
    project_name: str = "",
    related_table: str = "",
    related_id: int | None = None,
    usage: dict[str, Any] | None = None,
) -> None:
    """Insert one row into `ai_usage_events`. Never raises - a usage-logging
    failure must not break the actual LLM call it is describing."""
    usage = usage or {}
    try:
        from app.db.database import SessionLocal
    except Exception:
        logger.exception("ai_usage_service: could not import SessionLocal; skipping usage log.")
        return

    db = SessionLocal()
    try:
        db.execute(
            text(
                """
                INSERT INTO ai_usage_events
                  (provider, model, feature, route, user_id, project_name, related_table, related_id,
                   prompt_tokens, completion_tokens, total_tokens, input_tokens, output_tokens,
                   cached_tokens, billable_units, raw_usage)
                VALUES
                  (:provider, :model, :feature, :route, :user_id, :project_name, :related_table, :related_id,
                   :prompt_tokens, :completion_tokens, :total_tokens, :input_tokens, :output_tokens,
                   :cached_tokens, :billable_units, CAST(:raw_usage AS jsonb))
                """
            ),
            {
                "provider": provider or "",
                "model": model or "",
                "feature": feature or "",
                "route": route or "",
                "user_id": user_id or None,
                "project_name": project_name or "",
                "related_table": related_table or "",
                "related_id": related_id,
                "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                "completion_tokens": int(usage.get("completion_tokens") or 0),
                "total_tokens": int(usage.get("total_tokens") or 0),
                "input_tokens": int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0),
                "output_tokens": int(usage.get("output_tokens") or usage.get("completion_tokens") or 0),
                "cached_tokens": int(usage.get("cached_tokens") or 0),
                "billable_units": int(usage.get("billable_units") or 0),
                "raw_usage": _json_dump(usage),
            },
        )
        db.commit()
    except Exception:
        logger.exception("ai_usage_service: failed to record usage event (feature=%s, model=%s).", feature, model)
        db.rollback()
    finally:
        db.close()


def _json_dump(value: dict[str, Any]) -> str:
    import json

    return json.dumps(value or {}, ensure_ascii=True, default=str)
