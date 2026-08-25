"""Builds a cumulative per-stage summary, stored in
student_stage_progress.stage_notes (previously an unused column - see
sql/migrations/2026-08-13_01_startup_journey_schema.sql). Called from
mark_stage_complete() in app/services/startup_progress.py right after a
stage is marked completed.

Each stage's summary folds in the *previous* stage's summary text, so by the
last stage it reads as a running narrative of the whole journey rather than
just that one stage in isolation. Built from three sources, all scoped to
this user+stage:
  - the student's primary startup idea (context_builder._primary_startup_idea)
  - that stage's web search results (web_search_results, via agent_runs -
    the stage-start search from Backend/adminService/src/services/webSearchService.js)
  - that stage's chat turns (agent_runs.query_text / final_answer)

Falls back to a plain-text concatenation when no OpenAI key is configured,
or if the LLM call fails - this never raises, same convention as the rest of
the deliverable-review pipeline (stage_document_review.py)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.ai_usage_service import extract_usage_metadata, record_ai_usage_event
from app.services.context_builder import _primary_startup_idea
from app.services.review_runner import _openai_review_model

logger = logging.getLogger(__name__)

MAX_SUMMARY_CHARS = 2000


def _ordered_stage_ids(db: Session) -> list[int]:
    rows = db.execute(
        text(
            """
            SELECT js.id
            FROM journey_stages js
            JOIN journey_phases jp ON jp.id = js.phase_id
            WHERE js.is_active = TRUE AND jp.is_active = TRUE
            ORDER BY jp.phase_order ASC, js.stage_order ASC, js.id ASC
            """
        )
    ).all()
    return [row[0] for row in rows]


def previous_stage_summary(db: Session, user_id, stage_id: int) -> str:
    """The prior stage's stage_notes, if that stage is completed - the
    "remember the previous stage" half of this feature."""
    ordered = _ordered_stage_ids(db)
    if stage_id not in ordered:
        return ""
    index = ordered.index(stage_id)
    if index == 0:
        return ""
    previous_stage_id = ordered[index - 1]
    row = db.execute(
        text(
            "SELECT stage_notes FROM student_stage_progress "
            "WHERE user_id = :user_id AND stage_id = :stage_id AND status = 'completed' "
            "ORDER BY completed_at DESC LIMIT 1"
        ),
        {"user_id": user_id, "stage_id": previous_stage_id},
    ).first()
    return (row[0] if row else "") or ""


def _stage_chat_turns(db: Session, user_id, stage_id: int, limit: int = 20) -> list[tuple[str, str]]:
    rows = db.execute(
        text(
            """
            SELECT query_text, final_answer
            FROM agent_runs
            WHERE user_id = :user_id AND stage_id = :stage_id AND status = 'succeeded'
            ORDER BY created_at ASC
            LIMIT :limit
            """
        ),
        {"user_id": user_id, "stage_id": stage_id, "limit": limit},
    ).all()
    return [(row[0] or "", row[1] or "") for row in rows]


def _stage_web_search_snippets(db: Session, user_id, stage_id: int, limit: int = 8) -> list[str]:
    rows = db.execute(
        text(
            """
            SELECT wsr.result_title, wsr.snippet
            FROM web_search_results wsr
            JOIN agent_runs ar ON ar.id = wsr.agent_run_id
            WHERE ar.user_id = :user_id AND ar.stage_id = :stage_id
            ORDER BY wsr.fetched_at DESC
            LIMIT :limit
            """
        ),
        {"user_id": user_id, "stage_id": stage_id, "limit": limit},
    ).all()
    return [f"{row[0]}: {row[1]}" for row in rows if row[0] or row[1]]


def _stage_deliverable_reviews(db: Session, user_id, stage_id: int) -> list[dict]:
    """The latest review (AI or mentor) for each of this user's *approved*
    deliverable submissions in this stage — i.e. the docs that actually
    passed. DISTINCT ON (per deliverable) picks the most recent review when
    a deliverable went through more than one review pass (e.g. AI then
    mentor)."""
    rows = db.execute(
        text(
            """
            SELECT DISTINCT ON (sd.id)
                   sd.deliverable_name, dr.score, dr.feedback, dr.reviewer_type
            FROM student_deliverable_submissions sub
            JOIN stage_deliverables sd ON sd.id = sub.deliverable_id
            JOIN deliverable_reviews dr ON dr.submission_id = sub.id
            WHERE sub.user_id = :user_id AND sub.stage_id = :stage_id AND sub.status = 'approved'
            ORDER BY sd.id, dr.reviewed_at DESC NULLS LAST, dr.created_at DESC
            """
        ),
        {"user_id": user_id, "stage_id": stage_id},
    ).all()
    return [
        {"deliverable_name": row[0], "score": row[1], "feedback": row[2] or "", "reviewer_type": row[3]}
        for row in rows
    ]


def _stage_name(db: Session, stage_id: int) -> str:
    row = db.execute(text("SELECT stage_name FROM journey_stages WHERE id = :id"), {"id": stage_id}).first()
    return row[0] if row else ""


def _fallback_summary(
    stage_name: str,
    idea: dict | None,
    chat_turns: list[tuple[str, str]],
    web_snippets: list[str],
    deliverable_reviews: list[dict],
    previous_summary: str,
) -> str:
    """Non-LLM summary - plain concatenation, trimmed to MAX_SUMMARY_CHARS.
    Used when no OpenAI key is configured, so this feature degrades instead
    of silently doing nothing."""
    parts = []
    if previous_summary:
        parts.append(f"So far: {previous_summary}")
    parts.append(f"Completed stage: {stage_name}.")
    if idea:
        parts.append(f"Idea: {idea.get('idea_title', '')} — {idea.get('problem_statement', '')}")
    if chat_turns:
        last_question, last_answer = chat_turns[-1]
        parts.append(f"Last discussed: {last_question[:200]} -> {last_answer[:300]}")
    if web_snippets:
        parts.append(f"Researched: {web_snippets[0][:200]}")
    if deliverable_reviews:
        reviewed = ", ".join(
            f"{item['deliverable_name']} (scored {item['score']}/100)" for item in deliverable_reviews
        )
        parts.append(f"Approved deliverables: {reviewed}.")
    return " ".join(parts).strip()[:MAX_SUMMARY_CHARS]


def build_stage_summary(db: Session, user_id, stage_id: int) -> str:
    """Builds (and returns - does not persist) the cumulative stage_notes
    text for one completed stage. Caller (mark_stage_complete) writes it to
    student_stage_progress.stage_notes."""
    stage_name = _stage_name(db, stage_id) or f"Stage {stage_id}"
    idea = _primary_startup_idea(db, user_id)
    chat_turns = _stage_chat_turns(db, user_id, stage_id)
    web_snippets = _stage_web_search_snippets(db, user_id, stage_id)
    deliverable_reviews = _stage_deliverable_reviews(db, user_id, stage_id)
    previous_summary = previous_stage_summary(db, user_id, stage_id)

    settings = get_settings()
    if not settings.openai_api_key:
        return _fallback_summary(stage_name, idea, chat_turns, web_snippets, deliverable_reviews, previous_summary)

    try:
        from langchain_openai import ChatOpenAI

        idea_text = (
            f"{idea.get('idea_title', '')} — {idea.get('problem_statement', '')} "
            f"(solution: {idea.get('solution_summary', '')}, target users: {idea.get('target_users', '')})"
            if idea
            else "No startup idea on file yet."
        )
        chat_text = (
            "\n".join(f"Q: {question}\nA: {answer[:600]}" for question, answer in chat_turns)
            or "No chat activity recorded for this stage."
        )
        web_text = "\n".join(f"- {snippet}" for snippet in web_snippets) or "No web research recorded for this stage."
        reviews_text = (
            "\n".join(
                f"- {item['deliverable_name']}: scored {item['score']}/100 ({item['reviewer_type']} review) — {item['feedback']}"
                for item in deliverable_reviews
            )
            or "No deliverables were required/submitted for this stage."
        )

        prompt = f"""You are maintaining a running summary of one student's startup journey, one stage at a time.

Previous stages so far:
{previous_summary or "(this is the student's first stage)"}

Student's startup idea:
{idea_text}

What happened in this stage ("{stage_name}"):
Chat with the AI mentor:
{chat_text}

Web research surfaced for this stage:
{web_text}

Approved deliverables and their reviews:
{reviews_text}

Write an updated cumulative summary (max ~150 words) that folds this stage into the running narrative above — carry forward what still matters from earlier stages, and add what's new from this stage, including anything notable from the deliverable reviews (strengths, gaps the reviewer flagged, etc). Plain prose, no headings, no markdown."""

        model = _openai_review_model(settings)
        chat = ChatOpenAI(model=model, api_key=settings.openai_api_key, temperature=0.3, max_retries=0)
        response = chat.invoke(prompt)
        usage = extract_usage_metadata(response)
        if usage:
            record_ai_usage_event(
                provider="openai",
                model=model,
                feature="stage_summary",
                route="backend.app.services.stage_summary_service.build_stage_summary",
                user_id=str(user_id),
                project_name="startup_journey",
                usage={**usage, "prompt_chars": len(prompt), "prompt_estimated_tokens": max(1, len(prompt) // 4)},
            )
        content = getattr(response, "content", response)
        if isinstance(content, list):
            content = "\n".join(str(item) for item in content if item)
        summary_text = str(content).strip()
        if summary_text:
            return summary_text[:MAX_SUMMARY_CHARS]
        return _fallback_summary(stage_name, idea, chat_turns, web_snippets, deliverable_reviews, previous_summary)
    except Exception:
        logger.exception("Stage summary LLM call failed; falling back to plain concatenation.")
        return _fallback_summary(stage_name, idea, chat_turns, web_snippets, deliverable_reviews, previous_summary)
