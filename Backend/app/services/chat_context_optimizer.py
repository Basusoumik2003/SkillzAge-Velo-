"""Minimal placeholder for the chat-context optimizer.

You said this isn't needed right now, but `app/routes/chat.py` calls these
six functions in ~15 places (response caching key, local-stage shortcut
replies, RAG gating/limits) - removing the import without also ripping out
every call site would break the chat endpoint. So instead this ships the
simplest correct behavior for each function (no smart classification, no
local-reply shortcuts, always retrieve RAG context) so chat.py runs exactly
as if this optimization layer weren't there. Replace any of these with real
logic whenever you actually want the optimization back.
"""

from __future__ import annotations

import hashlib
import json


def is_cacheable_llm_message(message: str) -> bool:
    """Whether an LLM reply to this message may be served from the exact-
    response cache on a later identical message. Always True for now."""
    return True


def local_stage_reply(message: str, active_stage: dict) -> str | None:
    """A locally-generated reply that skips the LLM entirely (e.g. for
    trivial stage-status questions). Always None for now - every message
    goes through the LLM."""
    return None


def needs_document_context(message: str) -> bool:
    """Whether to run RAG retrieval for this message. Always True for now -
    retrieval itself is cheap and returns an empty context_text when there is
    nothing relevant, so there is no correctness downside to always trying."""
    return True


def rag_min_score_for_message(message: str) -> float:
    """Minimum relevance score a RAG chunk must clear to be included.
    0.0 for now (no filtering beyond the ranking itself)."""
    return 0.0


def rag_limits_for_message(message: str) -> tuple[int, int]:
    """(max_chunks, max_context_chars) for RAG retrieval. Matches
    rag_service.py's own defaults."""
    return 8, 9000


def response_cache_key(
    *,
    user_message: str,
    project_name: str,
    mentor_id,
    preferred_agent,
    active_stage: dict,
) -> str:
    """Deterministic key so an identical message (same project/mentor/stage)
    can be served from a previously-saved assistant reply instead of calling
    the LLM again."""
    payload = {
        "message": str(user_message or "").strip().lower(),
        "project_name": str(project_name or "").strip().lower(),
        "mentor_id": mentor_id,
        "preferred_agent": preferred_agent,
        "stage_key": str((active_stage or {}).get("stage_key") or ""),
        "step_number": (active_stage or {}).get("step_number"),
        "stage_index": (active_stage or {}).get("stage_index"),
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
