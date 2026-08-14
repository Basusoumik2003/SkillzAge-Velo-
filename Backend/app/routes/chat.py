import logging
import json
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.github_models import CodeReview, GitHubRepository
from app.db.models import Mentor, MentorChatMessage, Project, ProjectProgress, User
from app.routes.auth import get_current_user
from app.services.context_builder import apply_review_feedback, build_context, current_stage_label, project_tasks_from_db
from app.services.chat_cache import append_cached_messages, get_cached_history, set_cached_history
from app.services.chat_context_optimizer import (
    is_cacheable_llm_message,
    local_stage_reply,
    needs_document_context,
    rag_min_score_for_message,
    rag_limits_for_message,
    response_cache_key,
)
from app.services.intent_classifier import (
    INTENT_QUESTION,
    INTENT_LOW_INTENT,
    INTENT_OFF_TOPIC,
    INTENT_SOCIAL,
    INTENT_UNKNOWN,
    IntentClassification,
    classify_message_intent,
    overloaded_question_response,
)
from app.services.orchestrator import AGENT_LABELS, route_agent
from app.services.rag_service import retrieve_agent_context
from app.services.stage_document_review import (
    MAX_UPLOADED_DOCUMENT_CHARS,
    build_stage_document_review_artifacts,
    fetch_document_text,
    run_stage_document_review,
)

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger("internlabs-api.chat")

DAILY_GOOD_CHAT_LIMIT = 20
SESSION_GOOD_CHAT_LIMIT = 10
SESSION_WINDOW = timedelta(hours=1)
MENTOR_COOLDOWN = timedelta(hours=2)
DAILY_WINDOW = timedelta(hours=24)
REVIEW_RAG_DOCUMENT_SNIPPET_CHARS = 2500
REVIEW_RAG_MAX_DOCUMENT_SNIPPETS = 3

MENTOR_BUSY_MESSAGES = [
    "I have a meeting right now. Till then, continue working on whatever has been explained so far. We'll discuss further later.",
    "I'm tied up with something at the moment. Please work on the points we have covered so far. I'll get back to you shortly.",
    "I'm currently working with a few interns. For now, continue with the tasks and concepts discussed till now. I'll be back soon.",
    "I need to step into a meeting now. Use this time to complete what we have already discussed.",
    "I'm a bit occupied right now. Go through the topics we have covered so far, and we'll continue once I'm free.",
    "Give me a little time. I'm handling something important. Meanwhile, keep working on what has been explained so far.",
    "I have to take care of something right now. Continue with the work based on what we have discussed so far.",
    "I'm in between a few things at the moment. Keep progressing with the points covered so far. I'll reconnect shortly.",
    "Let's pause this here for now. Review and work on whatever we have discussed so far, and we'll continue later.",
]

MENTOR_BACK_MESSAGES = [
    "I'm back now. Let's continue from where we left off.",
    "I'm available now. Let's get back to the discussion.",
    "I'm back. Thanks for waiting - we can continue now.",
    "I'm free now. Let's pick up the conversation.",
    "Back now. Where were we? Let's continue from there.",
    "I'm done with my meeting. Let's continue with your questions.",
    "I'm available again. Let's go through the next point.",
    "I'm back now. Tell me where we stopped, and we'll continue.",
    "Thanks for your patience. I'm back and ready to continue.",
]


def _stage_blocks_from_context(raw: str | None) -> list[list[str]]:
    lines = str(raw or "").replace("\r\n", "\n").split("\n")
    try:
        stages_index = next(index for index, line in enumerate(lines) if str(line or "").strip() == "Stages:")
    except StopIteration:
        return []
    stages_raw = "\n".join(lines[stages_index + 1:]).strip()
    if not stages_raw:
      return []
    return [
      [line.strip() for line in block.split("\n") if line.strip()]
      for block in stages_raw.split("\n\n")
      if block.strip()
    ]


def _stage_requires_github_integration(db: Session, project_name: str, step_number: int, stage_index: int) -> bool:
    project = (
        db.query(Project)
        .filter(func.lower(func.trim(Project.title)) == str(project_name or "").strip().lower())
        .first()
    )
    steps = project.steps_json if project and isinstance(project.steps_json, list) else []
    if step_number < 1 or step_number > len(steps):
        return False
    step = steps[step_number - 1] or {}
    blocks = _stage_blocks_from_context(step.get("step_context") if isinstance(step, dict) else "")
    if stage_index < 0 or stage_index >= len(blocks):
        return False
    github_line = next((line for line in blocks[stage_index] if line.lower().startswith("github integration required:")), "")
    value = github_line.split(":", 1)[1].strip() if ":" in github_line else ""
    return value.lower() in {"yes", "true", "1", "required"}


def _user_has_github_repository(db: Session, user_id: int, project_name: str) -> bool:
    return (
        db.query(GitHubRepository.id)
        .filter(
            GitHubRepository.user_id == user_id,
            GitHubRepository.repository_url != "",
            func.lower(func.trim(GitHubRepository.project_name)) == str(project_name or "").strip().lower(),
        )
        .first()
        is not None
    )


class ChatInput(BaseModel):
    message: str
    project_name: str
    client_message_id: str | None = None
    preferred_agent: str | None = None
    mentor_id: int | None = None
    stage_key: str | None = None
    step_number: int | None = None
    stage_index: int | None = None
    phase_title: str | None = None
    stage_title: str | None = None
    stage_context: str | None = None
    objective: str | None = None
    deliverable: str | None = None
    document_required: bool | None = None
    documents: list[dict] | None = None
    complete_task: str | None = None


class BootstrapInput(BaseModel):
    project_name: str


class StageDocumentReviewInput(BaseModel):
    project_name: str
    step_number: int
    stage_index: int
    stage_key: str | None = None
    stage_title: str | None = None
    objective: str | None = None
    deliverable: str | None = None
    stage_context: str | None = None
    preferred_agent: str | None = None
    mentor_id: int | None = None
    document_url: str | None = None
    document_name: str | None = None
    documents: list[dict] | None = None


class LocalChatMessageInput(BaseModel):
    project_name: str
    role: str
    message: str
    client_message_id: str | None = None
    agent_key: str | None = None
    agent_name: str | None = None
    mentor_id: int | None = None
    stage_key: str | None = None
    step_number: int | None = None
    stage_index: int | None = None
    kind: str | None = None
    metadata: dict | None = None


def _variant_index(*parts: object) -> int:
    seed = "|".join(str(part or "") for part in parts)
    return sum(ord(ch) for ch in seed)


def _pick_variant(options: list[str], *parts: object) -> str:
    if not options:
        return ""
    return options[_variant_index(*parts) % len(options)]


def _build_stage_review_rag_question(
    *,
    project_name: str,
    stage_title: str = "",
    objective: str = "",
    deliverable: str = "",
    stage_context: str = "",
    document_name: str = "",
    documents: list[dict] | None = None,
) -> tuple[str, dict]:
    parts = [
        "Stage document review retrieval query",
        f"Project: {project_name}",
        f"Stage: {stage_title}" if stage_title else "",
        f"Objective: {objective}" if objective else "",
        f"Expected deliverable: {deliverable}" if deliverable else "",
        f"Stage instructions: {stage_context}" if stage_context else "",
        f"Primary submitted document: {document_name}" if document_name else "",
    ]
    snippet_count = 0
    snippet_chars = 0
    snippet_errors: list[str] = []
    for doc in (documents or [])[:REVIEW_RAG_MAX_DOCUMENT_SNIPPETS]:
        if not isinstance(doc, dict):
            continue
        url = str(doc.get("document_url") or doc.get("url") or "").strip()
        name = str(doc.get("document_name") or doc.get("name") or "").strip()
        if name:
            parts.append(f"Submitted file: {name}")
        if not url:
            continue
        try:
            text_value = fetch_document_text(url, name)
        except Exception as exc:
            snippet_errors.append(str(exc)[:240])
            continue
        snippet = str(text_value or "").strip()
        if not snippet:
            continue
        snippet = snippet[:REVIEW_RAG_DOCUMENT_SNIPPET_CHARS]
        snippet_count += 1
        snippet_chars += len(snippet)
        parts.append(f"Submitted document excerpt {snippet_count}:\n{snippet}")

    question = "\n\n".join(str(part or "").strip() for part in parts if str(part or "").strip())
    return question, {
        "document_snippets_used": snippet_count,
        "document_snippet_chars": snippet_chars,
        "document_snippet_errors": snippet_errors[:3],
    }


def _as_utc(value: object) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _is_good_mentor_intent(intent: str | None) -> bool:
    return str(intent or "").strip().upper() not in {INTENT_LOW_INTENT, INTENT_SOCIAL, INTENT_OFF_TOPIC, INTENT_UNKNOWN, ""}


_CONTEXTUAL_SHORT_REPLIES = {
    "yes",
    "yeah",
    "yep",
    "ya",
    "sure",
    "ok",
    "okay",
    "correct",
    "right",
    "no",
    "nope",
    "both",
    "all",
    "everything",
    "all of it",
    "all of them",
    "all three",
    "all points",
    "cover all",
    "first",
    "second",
    "first one",
    "second one",
    "option 1",
    "option 2",
    "1",
    "2",
    "hr",
    "human resources",
    "policy",
    "policies",
    "it",
    "it help",
    "project status",
    "company info",
    "general company info",
}


def _normalize_short_reply(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().replace(".", "").replace(",", "").split())


def _previous_assistant_invited_short_reply(
    db: Session,
    *,
    user_id: int,
    project_name: str,
) -> bool:
    row = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user_id,
            MentorChatMessage.project_name == project_name,
            MentorChatMessage.role == "assistant",
        )
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .first()
    )
    if not row:
        return False
    message = str(row.message or "").strip().lower()
    if "?" not in message:
        return False
    return True


def _should_treat_short_reply_as_contextual_question(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    message: str | None,
    intent: str,
) -> bool:
    if intent not in {INTENT_LOW_INTENT, INTENT_UNKNOWN}:
        return False
    normalized = _normalize_short_reply(message)
    if not normalized:
        return False
    previous_invited = _previous_assistant_invited_short_reply(
        db,
        user_id=user_id,
        project_name=project_name,
    )
    if not previous_invited:
        return False
    if normalized in _CONTEXTUAL_SHORT_REPLIES:
        return True
    words = normalized.split()
    return len(words) <= 4 and len(normalized) <= 50 and any(ch.isalnum() for ch in normalized)


def _good_chat_rows(
    db: Session,
    *,
    user_id: int,
    now: datetime,
    exclude_client_message_id: str = "",
    exclude_row_id: int | None = None,
) -> list[MentorChatMessage]:
    cutoff = now - DAILY_WINDOW
    rows = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user_id,
            MentorChatMessage.role == "user",
            MentorChatMessage.created_at >= cutoff,
        )
        .order_by(MentorChatMessage.created_at.asc(), MentorChatMessage.id.asc())
        .limit(400)
        .all()
    )
    good_rows: list[MentorChatMessage] = []
    excluded_id = str(exclude_client_message_id or "").strip()
    for row in rows:
        if exclude_row_id and row.id == exclude_row_id:
            continue
        metadata = row.meta or {}
        if excluded_id and str(metadata.get("client_message_id") or "").strip() == excluded_id:
            continue
        if metadata.get("mentor_rate_limited"):
            continue
        if not _is_good_mentor_intent(metadata.get("intent")):
            continue
        good_rows.append(row)
    return good_rows


def _latest_active_cooldown(db: Session, *, user_id: int, now: datetime) -> tuple[datetime | None, MentorChatMessage | None]:
    rows = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user_id,
            MentorChatMessage.role == "user",
            MentorChatMessage.created_at >= now - (DAILY_WINDOW + timedelta(minutes=10)),
        )
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .limit(80)
        .all()
    )
    latest_until: datetime | None = None
    latest_row: MentorChatMessage | None = None
    for row in rows:
        until = _as_utc((row.meta or {}).get("mentor_cooldown_until"))
        if until and (latest_until is None or until > latest_until):
            latest_until = until
            latest_row = row
    if latest_until and latest_until > now:
        return latest_until, latest_row
    return None, latest_row


def _current_session(good_rows: list[MentorChatMessage], now: datetime) -> tuple[datetime | None, list[MentorChatMessage]]:
    session_start: datetime | None = None
    session_rows: list[MentorChatMessage] = []
    for row in good_rows:
        created_at = _as_utc(row.created_at)
        if not created_at:
            continue
        if session_start is None or created_at >= session_start + SESSION_WINDOW:
            session_start = created_at
            session_rows = [row]
        else:
            session_rows.append(row)
    if session_start is None or now >= session_start + SESSION_WINDOW:
        return None, []
    return session_start, session_rows


def _mentor_rate_limit_state(
    db: Session,
    *,
    user_id: int,
    intent: str,
    now: datetime,
    exclude_client_message_id: str = "",
    exclude_row_id: int | None = None,
) -> dict:
    if not _is_good_mentor_intent(intent):
        return {"limited": False}

    active_cooldown_until, latest_cooldown_row = _latest_active_cooldown(db, user_id=user_id, now=now)
    if active_cooldown_until:
        return {
            "limited": True,
            "limit_type": "session_cooldown",
            "cooldown_until": active_cooldown_until,
            "message": "",
        }

    good_rows = _good_chat_rows(
        db,
        user_id=user_id,
        now=now,
        exclude_client_message_id=exclude_client_message_id,
        exclude_row_id=exclude_row_id,
    )
    if len(good_rows) >= DAILY_GOOD_CHAT_LIMIT:
        oldest = _as_utc(good_rows[0].created_at) or now
        return {
            "limited": True,
            "limit_type": "daily_limit",
            "cooldown_until": oldest + DAILY_WINDOW,
            "message": "",
        }

    _session_start, session_rows = _current_session(good_rows, now)
    if len(session_rows) >= SESSION_GOOD_CHAT_LIMIT:
        tenth_message_at = _as_utc(session_rows[SESSION_GOOD_CHAT_LIMIT - 1].created_at) or now
        cooldown_until = tenth_message_at + MENTOR_COOLDOWN
        if cooldown_until > now:
            return {
                "limited": True,
                "limit_type": "session_cooldown",
                "cooldown_until": cooldown_until,
                "message": "",
            }

    if len(good_rows) > 0 and len(good_rows) % SESSION_GOOD_CHAT_LIMIT == 0:
        latest_message_at = _as_utc(good_rows[-1].created_at) or now
        cooldown_until = latest_message_at + MENTOR_COOLDOWN
        if cooldown_until > now:
            return {
                "limited": True,
                "limit_type": "total_message_cooldown",
                "cooldown_until": cooldown_until,
                "message": "",
            }

    back_message = ""
    latest_cooldown_until = _as_utc((latest_cooldown_row.meta or {}).get("mentor_cooldown_until")) if latest_cooldown_row else None
    if latest_cooldown_until and latest_cooldown_until <= now:
        newer_good = [
            row
            for row in good_rows
            if (_as_utc(row.created_at) or now) > latest_cooldown_until
        ]
        if not newer_good:
            back_message = _pick_variant(MENTOR_BACK_MESSAGES, user_id, latest_cooldown_until.isoformat())

    return {"limited": False, "back_message": back_message}


def _mentor_pause_after_current(db: Session, *, user_id: int, now: datetime, current_row: MentorChatMessage) -> dict:
    metadata = current_row.meta or {}
    if not _is_good_mentor_intent(metadata.get("intent")) or metadata.get("mentor_rate_limited"):
        return {}

    good_rows = _good_chat_rows(db, user_id=user_id, now=now)
    current_id = current_row.id
    if len(good_rows) >= DAILY_GOOD_CHAT_LIMIT and any(row.id == current_id for row in good_rows):
        oldest = _as_utc(good_rows[0].created_at) or now
        cooldown_until = oldest + DAILY_WINDOW
        if cooldown_until > now:
            return {
                "limit_type": "daily_limit",
                "cooldown_until": cooldown_until,
                "message": _pick_variant(MENTOR_BUSY_MESSAGES, user_id, current_id, oldest.isoformat(), "daily-after-current"),
            }

    _session_start, session_rows = _current_session(good_rows, now)
    if (
        len(session_rows) == SESSION_GOOD_CHAT_LIMIT
        and session_rows[-1].id == current_id
    ):
        current_at = _as_utc(current_row.created_at) or now
        cooldown_until = current_at + MENTOR_COOLDOWN
        if cooldown_until > now:
            return {
                "limit_type": "session_cooldown",
                "cooldown_until": cooldown_until,
                "message": _pick_variant(MENTOR_BUSY_MESSAGES, user_id, current_id, current_at.isoformat(), "after-current"),
            }

    if len(good_rows) > 0 and len(good_rows) % SESSION_GOOD_CHAT_LIMIT == 0 and good_rows[-1].id == current_id:
        current_at = _as_utc(current_row.created_at) or now
        cooldown_until = current_at + MENTOR_COOLDOWN
        if cooldown_until > now:
            return {
                "limit_type": "total_message_cooldown",
                "cooldown_until": cooldown_until,
                "message": _pick_variant(MENTOR_BUSY_MESSAGES, user_id, current_id, current_at.isoformat(), "total-after-current"),
            }

    return {}


def _agent_key_for_mentor(mentor: Mentor) -> str:
    configured = str(mentor.agent_key or "").strip().lower()
    if configured in {"qa", "qa_agent"}:
        return "qa"
    if configured in {"architect", "architect_agent", "team_lead_agent"}:
        return "architect"
    if configured in {"tech_lead", "engineer", "engineer_agent", "dev_agent", "marketing_lead_agent", "customer_experience_agent"}:
        return "tech_lead"
    if configured in {"pm", "pm_agent", "product", "business_analyst_agent"}:
        return "pm"

    text = f"{mentor.mentor_name or ''} {mentor.role or ''}".lower()
    if any(word in text for word in ("test", "qa", "quality")):
        return "qa"
    if any(word in text for word in ("design", "architect", "system")):
        return "architect"
    if any(word in text for word in ("build", "code", "engineer", "launch", "tech")):
        return "tech_lead"
    return "pm"


def _serialize_mentor(mentor: Mentor | None) -> dict:
    if not mentor:
        return {}
    return {
        "id": mentor.id,
        "agent_key": mentor.agent_key,
        "name": mentor.mentor_name,
        "role": mentor.role,
        "goal": mentor.goal,
        "backstory": mentor.backstory,
        "backend_key": _agent_key_for_mentor(mentor),
        "rules": mentor.backstory,
        "boundaries": "",
        "tone": "",
        "output_format": str(mentor.output_format or "").strip(),
        "speciality": str(mentor.goal or "").strip(),
    }


def _serialize_chat_message(message: MentorChatMessage) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "agent": message.agent_name or ("You" if message.role == "user" else "Mentor"),
        "agent_key": message.agent_key or "",
        "mentor_id": message.mentor_id,
        "content": message.message,
        "message": message.message,
        "metadata": message.meta or {},
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def _chat_message_matches_stage(
    message: dict,
    *,
    stage_key: str = "",
    step_number: int | None = None,
    stage_index: int | None = None,
) -> bool:
    def _as_int(value: object) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return -1

    metadata = message.get("metadata") or {}
    if stage_key:
        return str(metadata.get("stage_key") or "").strip() == stage_key
    if step_number is not None and _as_int(metadata.get("step_number")) != step_number:
        return False
    if stage_index is not None and _as_int(metadata.get("stage_index")) != stage_index:
        return False
    return True


def _save_chat_message(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    role: str,
    message: str,
    agent_key: str = "",
    agent_name: str = "",
    mentor_id: int | None = None,
    metadata: dict | None = None,
) -> MentorChatMessage:
    row = MentorChatMessage(
        user_id=user_id,
        project_name=project_name,
        mentor_id=mentor_id,
        agent_key=agent_key or "",
        agent_name=agent_name or "",
        role=role,
        message=message,
        meta=metadata or {},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _find_chat_message_by_client_id(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    role: str,
    client_message_id: str,
) -> MentorChatMessage | None:
    normalized_id = str(client_message_id or "").strip()
    if not normalized_id:
        return None
    rows = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user_id,
            func.lower(func.trim(MentorChatMessage.project_name)) == project_name.lower().strip(),
            MentorChatMessage.role == role,
        )
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .limit(200)
        .all()
    )
    for row in rows:
        metadata = row.meta or {}
        if str(metadata.get("client_message_id") or "").strip() == normalized_id:
            return row
    return None


def _find_assistant_message_by_cache_key(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    response_cache_key: str,
) -> MentorChatMessage | None:
    normalized_key = str(response_cache_key or "").strip()
    if not normalized_key:
        return None
    rows = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user_id,
            func.lower(func.trim(MentorChatMessage.project_name)) == project_name.lower().strip(),
            MentorChatMessage.role == "assistant",
        )
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .limit(300)
        .all()
    )
    for row in rows:
        metadata = row.meta or {}
        if str(metadata.get("response_cache_key") or "").strip() == normalized_key:
            return row
    return None


def _find_stage_document_upload_message(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    stage_key: str = "",
    step_number: int | None = None,
    stage_index: int | None = None,
    submission_group_id: str = "",
) -> MentorChatMessage | None:
    def _as_int(value: object) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return -1

    rows = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user_id,
            func.lower(func.trim(MentorChatMessage.project_name)) == project_name.lower().strip(),
            MentorChatMessage.role == "user",
        )
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .limit(300)
        .all()
    )
    normalized_stage_key = str(stage_key or "").strip()
    normalized_group_id = str(submission_group_id or "").strip()
    for row in rows:
        metadata = row.meta or {}
        if str(metadata.get("kind") or "").strip() != "stage_document_upload":
            continue
        if normalized_group_id and str(metadata.get("document_submission_group_id") or "").strip() == normalized_group_id:
            return row
        if normalized_stage_key and str(metadata.get("stage_key") or "").strip() != normalized_stage_key:
            continue
        if step_number is not None and _as_int(metadata.get("step_number")) != int(step_number):
            continue
        if stage_index is not None and _as_int(metadata.get("stage_index")) != int(stage_index):
            continue
        return row
    return None


def _stage_document_upload_message(documents: list[dict]) -> str:
    names = [
        str(item.get("document_name") or item.get("name") or item.get("document_url") or item.get("url") or "Document").strip()
        for item in documents
        if isinstance(item, dict)
    ]
    names = [name for name in names if name][:8]
    if not names:
        return "Uploaded documents for this stage."
    return "Uploaded documents:\n" + "\n".join(f"- {name}" for name in names)


def _save_stage_document_upload_message(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    stage_key: str,
    step_number: int,
    stage_index: int,
    submission_group_id: str,
    documents: list[dict],
    created_at: object = None,
) -> MentorChatMessage:
    row = MentorChatMessage(
        user_id=user_id,
        project_name=project_name,
        mentor_id=None,
        agent_key="",
        agent_name="You",
        role="user",
        message=_stage_document_upload_message(documents),
        meta={
            "kind": "stage_document_upload",
            "stage_key": stage_key,
            "step_number": step_number,
            "stage_index": stage_index,
            "document_submission_group_id": submission_group_id,
            "documents": documents,
        },
    )
    if created_at is not None:
        row.created_at = created_at
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _ensure_stage_document_upload_messages(db: Session, *, user_id: int, project_name: str) -> bool:
    try:
        rows = db.execute(
            text(
                """
                SELECT step_number, stage_index, submission_group_id, document_url, document_name,
                       document_public_id, created_at
                FROM project_stage_documents
                WHERE user_id = :user_id
                  AND lower(trim(project_name)) = lower(trim(:project_name))
                  AND COALESCE(document_url, '') <> ''
                ORDER BY step_number ASC, stage_index ASC, submission_group_id ASC, id ASC
                """
            ),
            {"user_id": user_id, "project_name": project_name},
        ).mappings().all()
    except SQLAlchemyError:
        return False

    grouped: dict[tuple[int, int, str], dict] = {}
    for row in rows:
        step_number = int(row.get("step_number") or 0)
        stage_index = int(row.get("stage_index") or 0)
        group_id = str(row.get("submission_group_id") or "").strip()
        key = (step_number, stage_index, group_id)
        if key not in grouped:
            grouped[key] = {"created_at": row.get("created_at"), "documents": []}
        grouped[key]["documents"].append(
            {
                "document_url": row.get("document_url") or "",
                "document_name": row.get("document_name") or "",
                "document_public_id": row.get("document_public_id") or "",
                "submission_group_id": group_id,
            }
        )

    created_any = False
    for (step_number, stage_index, group_id), item in grouped.items():
        if step_number < 1 or stage_index < 0:
            continue
        stage_key = f"{project_name}::step-{step_number}::stage-{stage_index + 1}"
        existing = _find_stage_document_upload_message(
            db,
            user_id=user_id,
            project_name=project_name,
            stage_key=stage_key,
            step_number=step_number,
            stage_index=stage_index,
            submission_group_id=group_id,
        )
        if existing:
            continue
        _save_stage_document_upload_message(
            db,
            user_id=user_id,
            project_name=project_name,
            stage_key=stage_key,
            step_number=step_number,
            stage_index=stage_index,
            submission_group_id=group_id,
            documents=item["documents"],
            created_at=item.get("created_at"),
        )
        created_any = True
    return created_any


def _ensure_stage_document_review_audit_table(db: Session) -> None:
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS stage_document_review_audits (
              id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              project_name TEXT NOT NULL,
              step_number INTEGER NOT NULL,
              stage_index INTEGER NOT NULL,
              submission_group_id TEXT NOT NULL DEFAULT '',
              document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
              parser_details JSONB NOT NULL DEFAULT '{}'::jsonb,
              raw_markdown TEXT NOT NULL DEFAULT '',
              optimized_text TEXT NOT NULL DEFAULT '',
              prompt_input JSONB NOT NULL DEFAULT '{}'::jsonb,
              full_prompt TEXT NOT NULL DEFAULT '',
              llm_raw_output TEXT NOT NULL DEFAULT '',
              llm_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              ai_probability NUMERIC(6,2) NOT NULL DEFAULT 0,
              ai_confidence NUMERIC(6,4) NOT NULL DEFAULT 0,
              ai_detection_status VARCHAR(20) NOT NULL DEFAULT '',
              ai_warning_message TEXT NOT NULL DEFAULT '',
              ai_detection_reason JSONB NOT NULL DEFAULT '[]'::jsonb,
              ai_raw_detector_response JSONB NOT NULL DEFAULT '{}'::jsonb,
              ai_detection_result JSONB NOT NULL DEFAULT '{}'::jsonb,
              review_source TEXT NOT NULL DEFAULT '',
              review_status VARCHAR(20) NOT NULL DEFAULT 'rejected',
              review_score INTEGER NOT NULL DEFAULT 0,
              review_feedback TEXT NOT NULL DEFAULT '',
              github_required BOOLEAN NOT NULL DEFAULT FALSE,
              github_connected BOOLEAN NOT NULL DEFAULT FALSE,
              stage_completed BOOLEAN NOT NULL DEFAULT FALSE,
              audit_text TEXT NOT NULL DEFAULT '',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_stage_document_review_audits_stage CHECK (stage_index >= 0),
              CONSTRAINT chk_stage_document_review_audits_step CHECK (step_number >= 1),
              CONSTRAINT chk_stage_document_review_audits_status CHECK (review_status IN ('approved', 'rejected'))
            )
            """
        )
    )
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS audit_text TEXT NOT NULL DEFAULT ''"))
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS ai_probability NUMERIC(6,2) NOT NULL DEFAULT 0"))
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(6,4) NOT NULL DEFAULT 0"))
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS ai_detection_status VARCHAR(20) NOT NULL DEFAULT ''"))
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS ai_warning_message TEXT NOT NULL DEFAULT ''"))
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS ai_detection_reason JSONB NOT NULL DEFAULT '[]'::jsonb"))
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS ai_raw_detector_response JSONB NOT NULL DEFAULT '{}'::jsonb"))
    db.execute(text("ALTER TABLE stage_document_review_audits ADD COLUMN IF NOT EXISTS ai_detection_result JSONB NOT NULL DEFAULT '{}'::jsonb"))
    db.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_recent
              ON stage_document_review_audits(user_id, project_name, created_at DESC)
            """
        )
    )
    db.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_group
              ON stage_document_review_audits(user_id, project_name, step_number, stage_index, submission_group_id)
            """
        )
    )


def _json_for_db(value: object) -> str:
    return json.dumps(value or {}, ensure_ascii=True, default=str)


def _review_audit_text(
    *,
    user_id: int,
    project_name: str,
    step_number: int,
    stage_index: int,
    submission_group_id: str,
    documents: list[dict],
    review_audit: dict,
    review_status: str,
    review_score: int,
    review_feedback: str,
    github_required: bool,
    github_connected: bool,
    stage_completed: bool,
) -> str:
    raw_markdown = str(review_audit.get("raw_markdown") or "")
    optimized_text = str(review_audit.get("optimized_document_text") or "")
    full_prompt = str(review_audit.get("prompt") or "")
    llm_raw_output = str(review_audit.get("llm_raw_output") or "")
    prompt_input = review_audit.get("prompt_input") or {}
    prompt_generation = review_audit.get("prompt_generation") or {}
    source_trace = review_audit.get("source_trace") or {}
    prompt_sources = source_trace.get("prompt_context_sources") if isinstance(source_trace, dict) else []
    prompt_sources = prompt_sources if isinstance(prompt_sources, list) else []
    prompt_source_chars = {
        str(item.get("field") or ""): int(item.get("chars") or 0)
        for item in prompt_sources
        if isinstance(item, dict)
    }
    normalized_review = review_audit.get("normalized_review") or {}
    optimization = review_audit.get("optimization") or {}
    ai_detection = review_audit.get("ai_detection") or {}
    parser_details = {
        "execution_flow": review_audit.get("execution_flow") or [],
        "documents": review_audit.get("documents") or [],
        "validation": review_audit.get("validation") or {},
        "optimization": review_audit.get("optimization") or {},
        "extraction_statistics": review_audit.get("extraction_statistics") or {},
        "token_analysis": review_audit.get("token_analysis") or {},
        "prompt_generation": review_audit.get("prompt_generation") or {},
        "llm_execution": review_audit.get("llm_execution") or {},
        "decision": review_audit.get("decision") or {},
        "ai_detection": review_audit.get("ai_detection") or {},
        "database_updates": review_audit.get("database_updates") or {},
        "source_trace": review_audit.get("source_trace") or {},
    }
    lines = [
        "STAGE DOCUMENT REVIEW AUDIT",
        "===========================",
        "",
        "IDENTITY",
        f"user_id: {user_id}",
        f"project_name: {project_name}",
        f"step_number: {step_number}",
        f"stage_index: {stage_index}",
        f"submission_group_id: {submission_group_id or ''}",
        "",
        "FINAL RESULT",
        f"review_source: {review_audit.get('review_source') or ''}",
        f"review_status: {review_status}",
        f"review_score: {review_score}",
        f"pass_threshold: {(review_audit.get('decision') or {}).get('pass_threshold', '')}",
        f"stage_completed: {bool(stage_completed)}",
        f"github_required: {bool(github_required)}",
        f"github_connected: {bool(github_connected)}",
        f"review_feedback: {review_feedback or ''}",
        "",
        "AI CONTENT DETECTION",
        f"ai_probability: {ai_detection.get('ai_probability', 0)}",
        f"ai_confidence: {ai_detection.get('confidence', 0)}",
        f"ai_detection_status: {ai_detection.get('status', '')}",
        f"ai_warning_message: {ai_detection.get('warning_message', '')}",
        "ai_detection_reasons:",
        json.dumps(ai_detection.get("reasons") or [], ensure_ascii=False, indent=2, default=str),
        "",
        "CHARACTER COUNTS",
        f"raw_markdown_chars: {len(raw_markdown)}",
        f"optimized_text_chars: {len(optimized_text)}",
        f"full_prompt_chars: {len(full_prompt)}",
        f"full_prompt_estimated_tokens: {prompt_generation.get('full_prompt_estimated_tokens') or max(1, len(full_prompt) // 4) if full_prompt else 0}",
        f"prompt_input_json_chars: {prompt_generation.get('prompt_input_json_chars') or len(json.dumps(prompt_input or {}, ensure_ascii=False, default=str))}",
        f"rag_context_chars: {prompt_generation.get('rag_context_chars') or prompt_source_chars.get('allowed_project_context', 0)}",
        f"document_excerpt_chars_sent: {prompt_generation.get('document_excerpt_chars') or prompt_source_chars.get('document_excerpt', len(optimized_text))}",
        f"llm_raw_output_chars: {len(llm_raw_output)}",
        f"submitted_document_estimated_tokens: {review_audit.get('estimated_input_tokens') or 0}",
        f"max_document_chars: {review_audit.get('max_document_chars') or 0}",
        f"prompt_format: {prompt_generation.get('prompt_format') or 'plain_text_prompt_with_json_output_instruction'}",
        "",
        "OPTIMIZATION REPORT",
        f"removed_extra_spaces: {optimization.get('removed_extra_spaces', False)}",
        f"normalized_newlines: {optimization.get('normalized_newlines', False)}",
        f"removed_empty_lines: {optimization.get('removed_empty_lines', 0)}",
        f"removed_null_chars: {optimization.get('removed_null_chars', 0)}",
        f"truncated: {optimization.get('truncated', False)}",
        f"original_chars: {optimization.get('original_chars', 0)}",
        f"post_normalization_chars: {optimization.get('post_normalization_chars', 0)}",
        f"final_chars: {optimization.get('final_chars', len(optimized_text))}",
        f"tables_preserved: {optimization.get('tables_preserved', True)}",
        f"headings_preserved: {optimization.get('headings_preserved', True)}",
        "",
        "DOCUMENTS JSON",
        json.dumps(documents or [], ensure_ascii=False, indent=2, default=str),
        "",
        "PIPELINE DETAILS JSON",
        json.dumps(parser_details, ensure_ascii=False, indent=2, default=str),
        "",
        "SOURCE TRACE JSON",
        json.dumps(review_audit.get("source_trace") or {}, ensure_ascii=False, indent=2, default=str),
        "",
        "PROMPT INPUT JSON",
        json.dumps(prompt_input, ensure_ascii=False, indent=2, default=str),
        "",
        "NORMALIZED REVIEW JSON",
        json.dumps(normalized_review, ensure_ascii=False, indent=2, default=str),
        "",
        "RAW MARKDOWN TEXT",
        raw_markdown,
        "",
        "OPTIMIZED TEXT",
        optimized_text,
        "",
        "FINAL PROMPT SENT TO LLM",
        full_prompt,
        "",
        "LLM RAW RESPONSE",
        llm_raw_output,
    ]
    return "\n".join(lines)[:10_000_000]


def _save_stage_document_review_audit(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    step_number: int,
    stage_index: int,
    submission_group_id: str,
    documents: list[dict],
    review_audit: dict,
    review_status: str,
    review_score: int,
    review_feedback: str,
    github_required: bool,
    github_connected: bool,
    stage_completed: bool,
) -> None:
    _ensure_stage_document_review_audit_table(db)
    document_ids = [
        {
            "id": item.get("id"),
            "document_name": item.get("document_name") or item.get("name") or "",
            "document_url": item.get("document_url") or item.get("url") or "",
            "document_public_id": item.get("document_public_id") or "",
            "submission_group_id": item.get("submission_group_id") or submission_group_id or "",
        }
        for item in documents
        if isinstance(item, dict)
    ]
    parser_details = {
        "execution_flow": review_audit.get("execution_flow") or [],
        "documents": review_audit.get("documents") or [],
        "validation": review_audit.get("validation") or {},
        "optimization": review_audit.get("optimization") or {},
        "extraction_statistics": review_audit.get("extraction_statistics") or {},
        "token_analysis": review_audit.get("token_analysis") or {
            "estimated_input_tokens": review_audit.get("estimated_input_tokens") or 0,
            "max_allowed_tokens": 0,
            "within_limit": True,
            "truncation_applied": False,
        },
        "prompt_generation": review_audit.get("prompt_generation") or {},
        "llm_execution": review_audit.get("llm_execution") or {},
        "decision": review_audit.get("decision") or {},
        "database_updates": review_audit.get("database_updates") or {},
        "source_trace": review_audit.get("source_trace") or {},
        "estimated_input_tokens": review_audit.get("estimated_input_tokens") or 0,
        "max_document_chars": review_audit.get("max_document_chars") or 0,
        "duration_ms": review_audit.get("duration_ms") or 0,
    }
    audit_text = _review_audit_text(
        user_id=user_id,
        project_name=project_name,
        step_number=step_number,
        stage_index=stage_index,
        submission_group_id=submission_group_id,
        documents=documents,
        review_audit=review_audit,
        review_status=review_status,
        review_score=review_score,
        review_feedback=review_feedback,
        github_required=github_required,
        github_connected=github_connected,
        stage_completed=stage_completed,
    )
    ai_detection = review_audit.get("ai_detection") or {}
    ai_reasons = ai_detection.get("reasons") if isinstance(ai_detection, dict) else []
    ai_raw_response = ai_detection.get("raw_detector_response") if isinstance(ai_detection, dict) else {}
    db.execute(
        text(
            """
            INSERT INTO stage_document_review_audits
              (user_id, project_name, step_number, stage_index, submission_group_id, document_ids,
               parser_details, raw_markdown, optimized_text, prompt_input, full_prompt, llm_raw_output,
               llm_json, ai_probability, ai_confidence, ai_detection_status, ai_warning_message,
               ai_detection_reason, ai_raw_detector_response, ai_detection_result,
               review_source, review_status, review_score, review_feedback,
               github_required, github_connected, stage_completed, audit_text)
            VALUES
              (:user_id, :project_name, :step_number, :stage_index, :submission_group_id, CAST(:document_ids AS jsonb),
               CAST(:parser_details AS jsonb), :raw_markdown, :optimized_text, CAST(:prompt_input AS jsonb),
               :full_prompt, :llm_raw_output, CAST(:llm_json AS jsonb), :ai_probability, :ai_confidence,
               :ai_detection_status, :ai_warning_message, CAST(:ai_detection_reason AS jsonb),
               CAST(:ai_raw_detector_response AS jsonb), CAST(:ai_detection_result AS jsonb), :review_source, :review_status,
               :review_score, :review_feedback, :github_required, :github_connected, :stage_completed, :audit_text)
            """
        ),
        {
            "user_id": user_id,
            "project_name": project_name,
            "step_number": step_number,
            "stage_index": stage_index,
            "submission_group_id": submission_group_id or "",
            "document_ids": _json_for_db(document_ids),
            "parser_details": _json_for_db(parser_details),
            "raw_markdown": str(review_audit.get("raw_markdown") or "")[:10_000_000],
            "optimized_text": str(review_audit.get("optimized_document_text") or "")[:10_000_000],
            "prompt_input": _json_for_db(review_audit.get("prompt_input") or {}),
            "full_prompt": str(review_audit.get("prompt") or "")[:10_000_000],
            "llm_raw_output": str(review_audit.get("llm_raw_output") or "")[:10_000_000],
            "llm_json": _json_for_db(review_audit.get("normalized_review") or {}),
            "ai_probability": float(ai_detection.get("ai_probability") or 0) if isinstance(ai_detection, dict) else 0,
            "ai_confidence": float(ai_detection.get("confidence") or 0) if isinstance(ai_detection, dict) else 0,
            "ai_detection_status": str(ai_detection.get("status") or "") if isinstance(ai_detection, dict) else "",
            "ai_warning_message": str(ai_detection.get("warning_message") or "") if isinstance(ai_detection, dict) else "",
            "ai_detection_reason": json.dumps(ai_reasons if isinstance(ai_reasons, list) else [], ensure_ascii=True, default=str),
            "ai_raw_detector_response": _json_for_db(ai_raw_response if isinstance(ai_raw_response, dict) else {}),
            "ai_detection_result": _json_for_db(ai_detection if isinstance(ai_detection, dict) else {}),
            "review_source": str(review_audit.get("review_source") or ""),
            "review_status": review_status,
            "review_score": int(review_score or 0),
            "review_feedback": review_feedback or "",
            "github_required": bool(github_required),
            "github_connected": bool(github_connected),
            "stage_completed": bool(stage_completed),
            "audit_text": audit_text,
        },
    )


def _resolve_admin_mentor(db: Session, mentor_id: int | None, preferred_agent: str | None) -> dict:
    mentor = None
    if mentor_id:
        mentor = db.query(Mentor).filter(Mentor.id == mentor_id, Mentor.is_hidden.is_(False)).first()
    if not mentor and preferred_agent in {"pm", "tech_lead", "architect", "qa"}:
        active_mentors = db.query(Mentor).filter(Mentor.is_hidden.is_(False)).order_by(Mentor.id.asc()).all()
        mentor = next((item for item in active_mentors if _agent_key_for_mentor(item) == preferred_agent), None)
    return _serialize_mentor(mentor)


def _get_stage_progress_row(
    db: Session,
    *,
    user_id: int,
    project_name: str,
    step_number: int | None,
    stage_index: int | None,
) -> dict:
    if step_number is None or stage_index is None:
        return {}

    row = db.execute(
        text(
            """
            SELECT status,
                   understood,
                   document_required,
                   document_review_status,
                   document_review_feedback,
                   document_reviewed_at
            FROM project_stage_progress
            WHERE user_id = :user_id
              AND project_name = :project_name
              AND step_number = :step_number
              AND stage_index = :stage_index
            LIMIT 1
            """
        ),
        {
            "user_id": user_id,
            "project_name": project_name,
            "step_number": step_number,
            "stage_index": stage_index,
        },
    ).mappings().first()

    return dict(row or {})


def _is_more_info_request(message: str) -> bool:
    text = str(message or "").strip().lower()
    if not text:
        return False
    phrases = (
        "more info",
        "more information",
        "explain more",
        "tell me more",
        "details",
        "detail",
        "elaborate",
        "clarify",
        "understand",
        "samjha",
        "samjhao",
        "aur bata",
        "more about",
    )
    return any(phrase in text for phrase in phrases)


def _completed_stage_more_info_response(active_stage: dict) -> str:
    title = str(active_stage.get("stage_title") or "this stage").strip()
    objective = str(active_stage.get("objective") or "").strip()
    deliverable = str(active_stage.get("deliverable") or "").strip()
    context = str(active_stage.get("stage_context") or "").strip()

    parts = [f"This stage, {title}, is already completed."]
    if objective:
        parts.append(f"Objective: {objective}")
    if deliverable:
        parts.append(f"Deliverable: {deliverable}")
    if context:
        parts.append(f"Important context: {context}")
    parts.append("If you are ready, continue with the next stage.")
    return "\n\n".join(parts)


def _friendly_low_intent_response(payload: ChatInput, intent: IntentClassification, mentor_name: str) -> str:
    stage_title = str(payload.stage_title or "").strip()
    deliverable = str(payload.deliverable or "").strip()
    objective = str(payload.objective or "").strip()
    mentor = str(mentor_name or "Mentor").strip() or "Mentor"
    stage_label = f"'{stage_title}'" if stage_title else "this stage"

    if intent.intent == INTENT_SOCIAL:
        options = [
            f"Hey, I am here with you. For {stage_label}, ask me what to do next, share your draft, or tell me where you are stuck.",
            f"Hi, good to see you here. We are working on {stage_label}; send me your question or your current work and I will guide you.",
            f"Hello. I am {mentor}, and I can help you move through {stage_label}. Tell me what you want to clarify first.",
        ]
        return _pick_variant(options, payload.message, payload.stage_key, stage_title)

    if intent.intent == INTENT_LOW_INTENT:
        options = [
            f"Got it. When you are ready, tell me what you want help with in {stage_label}.",
            f"Okay. You can ask me for the next step, a quick explanation, or feedback on your work for {stage_label}.",
            f"No problem. Share your doubt or draft for {stage_label}, and I will keep it simple.",
        ]
        return _pick_variant(options, payload.message, payload.stage_key, stage_title)

    if intent.intent == INTENT_OFF_TOPIC:
        return "I can help here with your current project stage, deliverable, or review feedback. Send me what you want to work on next."

    details = []
    if objective:
        details.append(f"Objective: {objective}")
    if deliverable:
        details.append(f"Deliverable: {deliverable}")
    if details:
        return f"I am here for {stage_label}. Please ask about the task, share your draft, or tell me what is confusing.\n\n" + "\n".join(details)
    return f"I am here for {stage_label}. Please ask about the task, share your draft, or tell me what is confusing."


def _project_payload(progress: ProjectProgress, db: Session | None = None) -> dict:
    return {
        "name": progress.project_name,
        "current_step": progress.current_step,
        "tasks": project_tasks_from_db(db, progress.project_name),
        "completed_tasks": [task for task in (progress.completed_tasks or "").split("||") if task],
    }


@router.get("/history")
def mentor_chat_history(
    project_name: str = Query(..., min_length=1),
    limit: int = Query(2000, ge=1, le=5000),
    stage_key: str | None = Query(None),
    step_number: int | None = Query(None, ge=1),
    stage_index: int | None = Query(None, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project_name = project_name.strip()
    normalized_stage_key = str(stage_key or "").strip()
    stage_scoped = bool(normalized_stage_key or step_number is not None or stage_index is not None)
    backfilled_uploads = _ensure_stage_document_upload_messages(db, user_id=user.id, project_name=project_name)
    if stage_scoped:
        rows = (
            db.query(MentorChatMessage)
            .filter(
                MentorChatMessage.user_id == user.id,
                func.lower(func.trim(MentorChatMessage.project_name)) == project_name.lower().strip(),
            )
            .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
            .limit(10000)
            .all()
        )
        messages = [_serialize_chat_message(row) for row in reversed(rows)]
        stage_messages = [
            message
            for message in messages
            if _chat_message_matches_stage(
                message,
                stage_key=normalized_stage_key,
                step_number=step_number,
                stage_index=stage_index,
            )
        ]
        logger.info(
            "chat_history:stage_load user_id=%s project=%s stage_key=%s step=%s stage=%s count=%s",
            user.id,
            project_name,
            normalized_stage_key,
            step_number,
            stage_index,
            len(stage_messages),
        )
        return {"messages": stage_messages, "cached": False, "stage_scoped": True}

    cached = get_cached_history(user.id, project_name)
    if cached is not None and not backfilled_uploads:
        logger.info(
            "chat_history:cache_hit user_id=%s project=%s count=%s",
            user.id,
            project_name,
            len(cached),
        )
        return {"messages": cached[-limit:], "cached": True}

    rows = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user.id,
            func.lower(func.trim(MentorChatMessage.project_name)) == project_name.lower().strip(),
        )
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .limit(limit)
        .all()
    )
    messages = [_serialize_chat_message(row) for row in reversed(rows)]
    set_cached_history(user.id, project_name, messages)
    logger.info(
        "chat_history:db_load user_id=%s project=%s count=%s",
        user.id,
        project_name,
        len(messages),
    )
    return {"messages": messages, "cached": False}


@router.get("/debug-history")
def mentor_chat_debug_history(
    project_name: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    normalized_project = project_name.lower().strip()
    count = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user.id,
            func.lower(func.trim(MentorChatMessage.project_name)) == normalized_project,
        )
        .count()
    )
    latest = (
        db.query(MentorChatMessage)
        .filter(MentorChatMessage.user_id == user.id)
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .first()
    )
    return {
        "authenticated_user_id": user.id,
        "project_name_received": project_name,
        "matching_message_count": count,
        "latest_user_message_project": latest.project_name if latest else None,
        "latest_user_message_id": latest.id if latest else None,
    }


def _bootstrap_pm_messages(context: dict) -> list[str]:
    student_name = context.get("student", {}).get("name") or "there"
    project_name = context.get("project", {}).get("name") or "your project"
    project_brief = context.get("project_brief", {}) or {}
    stage_name = current_stage_label(context)
    current_step = context.get("project", {}).get("current_step", 1)
    tasks = context.get("project", {}).get("tasks", []) or []
    first_task = tasks[0] if tasks else "define the target user and problem clearly"
    has_review = bool(context.get("latest_review"))
    summary = str(project_brief.get("summary") or "").strip()

    intro_line = _pick_variant(
        [
            f"Hi {student_name}, I am your mentor for this project.",
            f"Hi {student_name}. I will guide you through this project stage by stage.",
            f"Welcome {student_name}. I will help you think through this like a product builder.",
        ],
        student_name,
        project_name,
        current_step,
    )
    project_line = _pick_variant(
        [
            (
                f"You selected `{project_name}`.\n"
                f"{summary if summary else 'We will use the project details configured in the admin panel as our source of truth.'}"
            ),
            (
                f"We are working on `{project_name}`.\n"
                f"{summary if summary else 'The project stages and deliverables will come from the admin project setup.'}"
            ),
            (
                f"`{project_name}` is the active project.\n"
                f"{summary if summary else 'I will guide you using the configured project stages and your current progress.'}"
            ),
        ],
        project_name,
        current_step,
    )
    stage_line = _pick_variant(
        [
            (
                f"You are currently in the `{stage_name}` stage.\n"
                f"Your focus right now is to clearly define `{first_task}`."
            ),
            (
                f"Right now, you are in `{stage_name}`.\n"
                f"Before we move further, I want you to get clear on `{first_task}`."
            ),
            (
                f"The current stage is `{stage_name}`.\n"
                f"The important thing here is not speed. It is clarity around `{first_task}`."
            ),
        ],
        stage_name,
        first_task,
        current_step,
    )
    action_line = _pick_variant(
        [
            (
                "Start small.\n"
                "Open VS Code and create a short requirements note in your repo.\n"
                "Write the target user, the problem statement, and 3-5 core requirements."
            ),
            (
                "Let us keep the first deliverable simple.\n"
                "Create a short requirements note in your repo.\n"
                "Capture the target user, the problem statement, and 3-5 core requirements."
            ),
            (
                "Do not overbuild the first step.\n"
                "Open your repo and draft a short requirements note.\n"
                "Write down the target user, the problem statement, and 3-5 core requirements."
            ),
        ],
        project_name,
        first_task,
        current_step,
    )
    git_line = _pick_variant(
        [
            (
                "If you already know how to create a GitHub repo and push your work, do that after writing the note.\n"
                "If not, tell me which Git steps you already know, and I will guide you from there."
            ),
            (
                "Once the note is ready, push it if you are comfortable with GitHub.\n"
                "If Git is still unclear for you, tell me what part you already know and where you get stuck."
            ),
            (
                "After that, try to put the note into your repo and push it.\n"
                "If you are not confident with the Git flow yet, tell me what you can already do and I will help step by step."
            ),
        ],
        student_name,
        project_name,
        has_review,
    )
    question_line = _pick_variant(
        [
            "First question: who is the primary target user for this project, and what is their biggest pain point?",
            "Let us begin with the user. Who do you think this product is mainly for, and what problem hurts them the most?",
            "Before features, I want your view on the user. Who is the main user here, and what pain point are we solving first?",
        ],
        student_name,
        project_name,
        current_step,
    )
    review_line = (
        "I have looked at your latest work, so I can guide you a bit more precisely this time."
        if has_review
        else "At this stage, I want to understand how you are thinking about the problem and what you choose to submit."
    )
    messages = [
        intro_line,
        project_line,
    ]

    messages.extend(
        [
            stage_line,
            review_line,
            action_line,
            git_line,
            question_line,
        ]
    )
    return messages


@router.post("/bootstrap")
def mentor_bootstrap(payload: BootstrapInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    progress = (
        db.query(ProjectProgress)
        .filter(ProjectProgress.user_id == user.id, ProjectProgress.project_name == payload.project_name)
        .first()
    )

    if not progress:
        raise HTTPException(status_code=404, detail="Please select a project first")

    latest_review = (
        db.query(CodeReview)
        .filter(CodeReview.user_id == user.id, CodeReview.project_name == progress.project_name)
        .order_by(desc(CodeReview.created_at))
        .first()
    )

    context = build_context(user=user, progress=progress, latest_message="", db=db)
    context = apply_review_feedback(context, latest_review.review_feedback if latest_review else None)
    messages = _bootstrap_pm_messages(context)

    return {
        "agent": "Mentor",
        "message": "\n\n".join(messages),
        "messages": messages,
        "project": {
            "name": progress.project_name,
            "current_step": progress.current_step,
            "tasks": project_tasks_from_db(db, progress.project_name),
            "completed_tasks": [t for t in (progress.completed_tasks or "").split("||") if t],
        },
    }


@router.post("/local-message")
def save_local_chat_message(payload: LocalChatMessageInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project_name = str(payload.project_name or "").strip()
    role = str(payload.role or "").strip().lower()
    message = str(payload.message or "").strip()
    if not project_name:
        raise HTTPException(status_code=400, detail="project_name is required")
    if role not in {"user", "assistant"}:
        raise HTTPException(status_code=400, detail="role must be user or assistant")
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    progress = (
        db.query(ProjectProgress)
        .filter(ProjectProgress.user_id == user.id, ProjectProgress.project_name == project_name)
        .first()
    )
    if not progress:
        raise HTTPException(status_code=404, detail="Please select a project first")

    client_message_id = str(payload.client_message_id or "").strip()
    row = _find_chat_message_by_client_id(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        role=role,
        client_message_id=client_message_id,
    )
    if not row:
        metadata = {
            **(payload.metadata or {}),
            "stage_key": str(payload.stage_key or "").strip(),
            "step_number": payload.step_number,
            "stage_index": payload.stage_index,
            "client_message_id": client_message_id,
            "kind": str(payload.kind or "local").strip() or "local",
        }
        row = _save_chat_message(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role=role,
            message=message,
            agent_key=str(payload.agent_key or "").strip(),
            agent_name=str(payload.agent_name or ("You" if role == "user" else "Mentor")).strip(),
            mentor_id=payload.mentor_id,
            metadata=metadata,
        )
        append_cached_messages(user.id, progress.project_name, [_serialize_chat_message(row)])

    return {"message": _serialize_chat_message(row)}


@router.post("/")
def mentor_chat(payload: ChatInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    progress = (
        db.query(ProjectProgress)
        .filter(ProjectProgress.user_id == user.id, ProjectProgress.project_name == payload.project_name)
        .first()
    )

    if not progress:
        raise HTTPException(status_code=404, detail="Please select a project first")

    intent = classify_message_intent(payload.message)
    admin_mentor = _resolve_admin_mentor(db, payload.mentor_id, payload.preferred_agent)
    contextual_short_reply = _should_treat_short_reply_as_contextual_question(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        message=payload.message,
        intent=intent.intent,
    )
    if contextual_short_reply:
        intent = IntentClassification(INTENT_QUESTION)
    client_message_id = str(payload.client_message_id or "").strip()
    chat_metadata = {
        "stage_key": str(payload.stage_key or "").strip(),
        "step_number": payload.step_number,
        "stage_index": payload.stage_index,
        "preferred_agent": payload.preferred_agent,
        "client_message_id": client_message_id,
        "intent": intent.intent,
        "contextual_short_reply": contextual_short_reply,
    }

    user_row = _find_chat_message_by_client_id(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        role="user",
        client_message_id=client_message_id,
    )
    if not user_row:
        user_row = _save_chat_message(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="user",
            message=payload.message,
            agent_key=admin_mentor.get("backend_key") or payload.preferred_agent or "",
            agent_name="You",
            mentor_id=admin_mentor.get("id"),
            metadata=chat_metadata,
        )

    now = datetime.now(timezone.utc)
    rate_state = _mentor_rate_limit_state(
        db,
        user_id=user.id,
        intent=intent.intent,
        now=now,
        exclude_client_message_id=client_message_id,
        exclude_row_id=user_row.id,
    )
    if rate_state.get("limited"):
        existing_assistant_row = _find_chat_message_by_client_id(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="assistant",
            client_message_id=client_message_id,
        )
        if existing_assistant_row:
            return {
                "agent": existing_assistant_row.agent_name or admin_mentor.get("name") or "Mentor",
                "message": existing_assistant_row.message,
                "intent": intent.intent,
                "project": _project_payload(progress, db),
            }

        selected_agent = admin_mentor.get("backend_key") or payload.preferred_agent or "pm"
        rate_metadata = {
            **chat_metadata,
            "mentor_rate_limited": True,
            "mentor_limit_type": rate_state.get("limit_type") or "mentor_busy",
            "mentor_cooldown_until": (
                rate_state.get("cooldown_until").isoformat()
                if isinstance(rate_state.get("cooldown_until"), datetime)
                else ""
            ),
            "optimization": {
                "reply_source": "local_mentor_rate_limit",
                "rag_used": False,
                "llm_called": False,
                "llm_provider": "none",
                "claude_called": False,
            },
        }
        user_row.meta = rate_metadata
        db.add(user_row)
        busy_message = rate_state.get("message") or _pick_variant(
            MENTOR_BUSY_MESSAGES,
            user.id,
            user_row.id,
            client_message_id,
            payload.message,
            rate_state.get("limit_type"),
        )
        assistant_row = _save_chat_message(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="assistant",
            message=busy_message,
            agent_key=selected_agent,
            agent_name=admin_mentor.get("name") or AGENT_LABELS.get(selected_agent, "Mentor"),
            mentor_id=admin_mentor.get("id"),
            metadata=rate_metadata,
        )
        append_cached_messages(
            user.id,
            progress.project_name,
            [_serialize_chat_message(user_row), _serialize_chat_message(assistant_row)],
        )
        return {
            "agent": assistant_row.agent_name or "Mentor",
            "message": assistant_row.message,
            "intent": intent.intent,
            "project": _project_payload(progress, db),
        }

    back_message = str(rate_state.get("back_message") or "").strip()
    pause_after_current = _mentor_pause_after_current(db, user_id=user.id, now=now, current_row=user_row)

    overloaded_response = overloaded_question_response(payload.message)
    if overloaded_response:
        existing_assistant_row = _find_chat_message_by_client_id(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="assistant",
            client_message_id=client_message_id,
        )
        if existing_assistant_row:
            return {
                "agent": existing_assistant_row.agent_name or admin_mentor.get("name") or "Mentor",
                "message": existing_assistant_row.message,
                "intent": intent.intent,
                "project": _project_payload(progress, db),
            }

        selected_agent = admin_mentor.get("backend_key") or payload.preferred_agent or "pm"
        assistant_message = f"{back_message}\n\n{overloaded_response}" if back_message else overloaded_response
        if pause_after_current.get("message"):
            assistant_message = f"{assistant_message}\n\n{pause_after_current['message']}"
        chat_metadata["optimization"] = {
            "reply_source": "local_overloaded_question",
            "rag_used": False,
            "llm_called": False,
            "llm_provider": "none",
            "claude_called": False,
            "mentor_back_message": bool(back_message),
            "mentor_pause_after_current": bool(pause_after_current),
        }
        if pause_after_current:
            chat_metadata["mentor_cooldown_until"] = pause_after_current["cooldown_until"].isoformat()
            chat_metadata["mentor_limit_type"] = pause_after_current.get("limit_type") or "session_cooldown"
            user_row.meta = chat_metadata
            db.add(user_row)
        assistant_row = _save_chat_message(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="assistant",
            message=assistant_message,
            agent_key=selected_agent,
            agent_name=admin_mentor.get("name") or AGENT_LABELS.get(selected_agent, "Mentor"),
            mentor_id=admin_mentor.get("id"),
            metadata=chat_metadata,
        )
        append_cached_messages(
            user.id,
            progress.project_name,
            [_serialize_chat_message(user_row), _serialize_chat_message(assistant_row)],
        )
        return {
            "agent": assistant_row.agent_name or "Mentor",
            "message": assistant_message,
            "intent": intent.intent,
            "project": _project_payload(progress, db),
        }

    if intent.intent in {INTENT_LOW_INTENT, INTENT_SOCIAL, INTENT_OFF_TOPIC, INTENT_UNKNOWN}:
        selected_agent = admin_mentor.get("backend_key") or payload.preferred_agent or ""
        low_intent_agent_name = admin_mentor.get("name") or AGENT_LABELS.get(selected_agent, "Mentor")
        existing_assistant_row = _find_chat_message_by_client_id(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="assistant",
            client_message_id=client_message_id,
        )
        if existing_assistant_row:
            return {
                "agent": existing_assistant_row.agent_name or low_intent_agent_name,
                "message": existing_assistant_row.message,
                "intent": intent.intent,
                "project": _project_payload(progress, db),
            }

        assistant_message = _friendly_low_intent_response(payload, intent, low_intent_agent_name)
        assistant_row = _save_chat_message(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="assistant",
            message=assistant_message,
            agent_key=selected_agent,
            agent_name=low_intent_agent_name,
            mentor_id=admin_mentor.get("id"),
            metadata=chat_metadata,
        )
        append_cached_messages(
            user.id,
            progress.project_name,
            [_serialize_chat_message(user_row), _serialize_chat_message(assistant_row)],
        )
        logger.info(
            "mentor_chat:low_intent_saved user_id=%s project=%s intent=%s user_message_id=%s assistant_message_id=%s",
            user.id,
            progress.project_name,
            intent.intent,
            user_row.id,
            assistant_row.id,
        )
        return {
            "agent": assistant_row.agent_name or low_intent_agent_name,
            "message": assistant_message,
            "intent": intent.intent,
            "project": _project_payload(progress, db),
        }

    if payload.complete_task:
        done = [task for task in (progress.completed_tasks or "").split("||") if task]
        if payload.complete_task not in done:
            done.append(payload.complete_task)
        progress.completed_tasks = "||".join(done)
        task_count = len(project_tasks_from_db(db, progress.project_name))
        progress.current_step = min(task_count, len(done) + 1) if task_count else len(done) + 1
        db.add(progress)
        db.commit()
        db.refresh(progress)

    latest_review = (
        db.query(CodeReview)
        .filter(CodeReview.user_id == user.id, CodeReview.project_name == progress.project_name)
        .order_by(desc(CodeReview.created_at))
        .first()
    )

    context = build_context(user=user, progress=progress, latest_message=payload.message, db=db)
    recent_rows = (
        db.query(MentorChatMessage)
        .filter(
            MentorChatMessage.user_id == user.id,
            func.lower(func.trim(MentorChatMessage.project_name)) == progress.project_name.lower().strip(),
            MentorChatMessage.role == "assistant",
        )
        .order_by(desc(MentorChatMessage.created_at), desc(MentorChatMessage.id))
        .limit(20)
        .all()
    )
    recent_conversation = []
    for row in reversed(recent_rows):
        metadata = row.meta or {}
        optimization = metadata.get("optimization") if isinstance(metadata, dict) else {}
        if not isinstance(optimization, dict) or not optimization.get("llm_called"):
            continue
        message = str(row.message or "").strip()
        if message:
            recent_conversation.append({"role": row.role, "message": message[:1000]})
    context["recent_conversation"] = recent_conversation[-4:]
    context = apply_review_feedback(context, latest_review.review_feedback if latest_review else None)
    if payload.stage_key or payload.step_number is not None or payload.stage_index is not None:
        stage_progress = _get_stage_progress_row(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            step_number=payload.step_number,
            stage_index=payload.stage_index,
        )
        uploaded_documents = [
            {
                "id": item.get("id"),
                "submission_group_id": str(item.get("submission_group_id") or "").strip(),
                "document_url": str(item.get("document_url") or item.get("url") or "").strip(),
                "document_name": str(item.get("document_name") or item.get("name") or "").strip(),
                "document_public_id": str(item.get("document_public_id") or "").strip(),
            }
            for item in (payload.documents or [])
            if isinstance(item, dict) and (item.get("document_url") or item.get("url") or item.get("document_name") or item.get("name"))
        ]
        context["active_stage"] = {
            "stage_key": str(payload.stage_key or "").strip(),
            "step_number": payload.step_number,
            "stage_index": payload.stage_index,
            "phase_title": str(payload.phase_title or "").strip(),
            "stage_title": str(payload.stage_title or "").strip(),
            "stage_context": str(payload.stage_context or "").strip(),
            "objective": str(payload.objective or "").strip(),
            "deliverable": str(payload.deliverable or "").strip(),
            "document_required": bool(payload.document_required),
            "uploaded_documents": uploaded_documents,
            "status": str(stage_progress.get("status") or "").strip(),
            "is_completed": str(stage_progress.get("status") or "").strip().lower() == "completed",
            "document_review_status": str(stage_progress.get("document_review_status") or "").strip(),
            "document_review_feedback": str(stage_progress.get("document_review_feedback") or "").strip(),
            "scope_rule": (
                "This is stage-scoped chat. Answer only for this active stage. "
                "Do not summarize, teach, or plan all phases unless the student switches stages. "
                "If this stage is already completed and the student asks to know more, give only required or very important details if present; "
                "otherwise politely say the stage is already completed and ask them to continue with the next stages."
            ),
        }
    if admin_mentor:
        context["admin_mentor"] = admin_mentor

    existing_assistant_row = _find_chat_message_by_client_id(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        role="assistant",
        client_message_id=client_message_id,
    )
    if existing_assistant_row:
        return {
            "agent": existing_assistant_row.agent_name or admin_mentor.get("name") or "Mentor",
            "message": existing_assistant_row.message,
            "project": {
                "name": progress.project_name,
                "current_step": progress.current_step,
                "tasks": project_tasks_from_db(db, progress.project_name),
                "completed_tasks": [t for t in (progress.completed_tasks or "").split("||") if t],
            },
        }

    active_stage = context.get("active_stage") or {}
    cache_key = response_cache_key(
        user_message=payload.message,
        project_name=progress.project_name,
        mentor_id=admin_mentor.get("id"),
        preferred_agent=admin_mentor.get("backend_key") or payload.preferred_agent,
        active_stage=active_stage,
    )
    local_reply = local_stage_reply(payload.message, active_stage)
    if local_reply:
        selected_agent = admin_mentor.get("backend_key") or payload.preferred_agent or "pm"
        mentor_reply = {
            "agent": admin_mentor.get("name") or AGENT_LABELS.get(selected_agent, "Mentor"),
            "message": local_reply,
        }
        chat_metadata["optimization"] = {
            "reply_source": "local_stage_metadata",
            "rag_used": False,
            "llm_called": False,
            "llm_provider": "none",
            "claude_called": False,
            "response_cache_key": cache_key,
        }
    else:
        cached_assistant_row = (
            _find_assistant_message_by_cache_key(
                db,
                user_id=user.id,
                project_name=progress.project_name,
                response_cache_key=cache_key,
            )
            if is_cacheable_llm_message(payload.message)
            else None
        )
        if cached_assistant_row:
            mentor_reply = {
                "agent": cached_assistant_row.agent_name or admin_mentor.get("name") or "Mentor",
                "message": cached_assistant_row.message,
            }
            chat_metadata["optimization"] = {
                "reply_source": "exact_response_cache",
                "rag_used": False,
                "llm_called": False,
                "llm_provider": "cache",
                "claude_called": False,
                "response_cache_key": cache_key,
                "cached_assistant_message_id": cached_assistant_row.id,
            }
        elif needs_document_context(payload.message):
            max_chunks, max_context_chars = rag_limits_for_message(payload.message)
            min_score = rag_min_score_for_message(payload.message)
            rag_context = retrieve_agent_context(
                db,
                project_name=progress.project_name,
                mentor_id=admin_mentor.get("id"),
                backend_agent_key=admin_mentor.get("backend_key") or payload.preferred_agent or "",
                question=payload.message,
                max_chunks=max_chunks,
                max_context_chars=max_context_chars,
                min_relevance_score=min_score,
            )
            rag_chunks = rag_context.get("chunks") or []
            if rag_context.get("chunks"):
                context["allowed_document_context"] = rag_context
            chat_metadata["optimization"] = {
                "reply_source": "llm",
                "rag_used": bool(rag_chunks),
                "rag_max_chunks": max_chunks,
                "rag_max_context_chars": max_context_chars,
                "rag_min_score": min_score,
                "rag_retrieved_chunks": len(rag_chunks),
                "rag_chunks": [
                    {
                        "score": chunk.get("score"),
                        "document_title": chunk.get("document_title"),
                        "document_type": chunk.get("document_type"),
                        "source_scope": chunk.get("source_scope"),
                        "global_category": chunk.get("global_category"),
                        "chunk_index": chunk.get("chunk_index"),
                        "preview": str(chunk.get("content") or "")[:280],
                    }
                    for chunk in rag_chunks[:8]
                    if isinstance(chunk, dict)
                ],
                "llm_called": True,
                "llm_provider": "openai",
                "claude_called": False,
                "response_cache_key": cache_key,
            }
            if not rag_chunks:
                chat_metadata["optimization"]["rag_skipped"] = "no_matching_document_chunks"
        else:
            chat_metadata["optimization"] = {
                "reply_source": "llm",
                "rag_used": False,
                "rag_skipped": "message_did_not_need_document_context",
                "llm_called": True,
                "llm_provider": "openai",
                "claude_called": False,
                "response_cache_key": cache_key,
            }

    if active_stage.get("is_completed") and _is_more_info_request(payload.message):
        selected_agent = admin_mentor.get("backend_key") or payload.preferred_agent or "pm"
        mentor_reply = {
            "agent": admin_mentor.get("name") or AGENT_LABELS.get(selected_agent, "Mentor"),
            "message": _completed_stage_more_info_response(active_stage),
        }
        chat_metadata["optimization"] = {
            "reply_source": "local_completed_stage",
            "rag_used": False,
            "llm_called": False,
            "llm_provider": "none",
            "claude_called": False,
            "response_cache_key": cache_key,
        }
    elif not local_reply and chat_metadata.get("optimization", {}).get("reply_source") != "exact_response_cache":
        mentor_reply = route_agent(context=context, preferred_agent=admin_mentor.get("backend_key") or payload.preferred_agent)
    if back_message and mentor_reply.get("message"):
        mentor_reply["message"] = f"{back_message}\n\n{mentor_reply['message']}"
        optimization = chat_metadata.get("optimization") or {}
        optimization["mentor_back_message"] = True
        chat_metadata["optimization"] = optimization
    if pause_after_current.get("message") and mentor_reply.get("message"):
        mentor_reply["message"] = f"{mentor_reply['message']}\n\n{pause_after_current['message']}"
        chat_metadata["mentor_cooldown_until"] = pause_after_current["cooldown_until"].isoformat()
        chat_metadata["mentor_limit_type"] = pause_after_current.get("limit_type") or "session_cooldown"
        optimization = chat_metadata.get("optimization") or {}
        optimization["mentor_pause_after_current"] = True
        chat_metadata["optimization"] = optimization
        user_row.meta = chat_metadata
        db.add(user_row)
    chat_metadata["response_cache_key"] = cache_key
    assistant_row = _save_chat_message(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        role="assistant",
        message=mentor_reply["message"],
        agent_key=admin_mentor.get("backend_key") or payload.preferred_agent or "",
        agent_name=mentor_reply["agent"],
        mentor_id=admin_mentor.get("id"),
        metadata=chat_metadata,
    )
    append_cached_messages(
        user.id,
        progress.project_name,
        [_serialize_chat_message(user_row), _serialize_chat_message(assistant_row)],
    )
    logger.info(
        "mentor_chat:saved user_id=%s project=%s mentor_id=%s agent=%s user_message_id=%s assistant_message_id=%s optimization=%s",
        user.id,
        progress.project_name,
        admin_mentor.get("id"),
        mentor_reply["agent"],
        user_row.id,
        assistant_row.id,
        chat_metadata.get("optimization"),
    )

    return {
        "agent": mentor_reply["agent"],
        "message": mentor_reply["message"],
        "project": {
            "name": progress.project_name,
            "current_step": progress.current_step,
            "tasks": project_tasks_from_db(db, progress.project_name),
            "completed_tasks": [t for t in (progress.completed_tasks or "").split("||") if t],
        },
    }


@router.post("/stage-document-review")
def review_stage_document(payload: StageDocumentReviewInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    progress = (
        db.query(ProjectProgress)
        .filter(ProjectProgress.user_id == user.id, ProjectProgress.project_name == payload.project_name)
        .first()
    )
    if not progress:
        raise HTTPException(status_code=404, detail="Please select a project first")
    if payload.step_number < 1 or payload.stage_index < 0:
        raise HTTPException(status_code=400, detail="Invalid stage.")

    stage_row = db.execute(
        text(
            """
            SELECT document_url, document_name, document_public_id, document_submission_group_id, started_at, updated_at, document_reviewed_at
            FROM project_stage_progress
            WHERE user_id = :user_id
              AND project_name = :project_name
              AND step_number = :step_number
              AND stage_index = :stage_index
            LIMIT 1
            """
        ),
        {
            "user_id": user.id,
            "project_name": progress.project_name,
            "step_number": payload.step_number,
            "stage_index": payload.stage_index,
        },
    ).mappings().first()
    if not stage_row or not stage_row.get("document_url"):
        raise HTTPException(status_code=400, detail="Upload the required document before requesting review.")

    try:
        document_rows = db.execute(
            text(
                """
                SELECT id, submission_group_id, document_url, document_name, document_public_id,
                       document_review_status, document_review_feedback, document_reviewed_at, created_at
                FROM project_stage_documents
                WHERE user_id = :user_id
                  AND project_name = :project_name
                  AND step_number = :step_number
                  AND stage_index = :stage_index
                ORDER BY id ASC
                """
            ),
            {
                "user_id": user.id,
                "project_name": progress.project_name,
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
            },
        ).mappings().all()
    except SQLAlchemyError as exc:
        logger.exception(
            "chat:document_rows_query_failed user_id=%s project=%s step=%s stage=%s error=%s",
            user.id,
            progress.project_name,
            payload.step_number,
            payload.stage_index,
            str(exc),
        )
        document_rows = []
    payload_documents = [
        {
            "id": item.get("id"),
            "submission_group_id": item.get("submission_group_id") or "",
            "document_url": item.get("document_url") or item.get("url") or "",
            "document_name": item.get("document_name") or item.get("name") or "",
            "document_public_id": item.get("document_public_id") or "",
            "document_review_status": item.get("document_review_status") or "not_submitted",
            "document_review_feedback": item.get("document_review_feedback") or "",
            "document_reviewed_at": item.get("document_reviewed_at"),
            "created_at": item.get("created_at"),
        }
        for item in (payload.documents or [])
        if isinstance(item, dict) and (item.get("document_url") or item.get("url"))
    ]
    db_documents = [
        {
            "id": row.get("id"),
            "submission_group_id": row.get("submission_group_id") or "",
            "document_url": row.get("document_url") or "",
            "document_name": row.get("document_name") or "",
            "document_public_id": row.get("document_public_id") or "",
            "document_review_status": row.get("document_review_status") or "not_submitted",
            "document_review_feedback": row.get("document_review_feedback") or "",
            "document_reviewed_at": row.get("document_reviewed_at"),
            "created_at": row.get("created_at"),
        }
        for row in document_rows
        if row.get("document_url")
    ]
    target_group_id = str(stage_row.get("document_submission_group_id") or "").strip()
    if target_group_id:
        documents = [
            row
            for row in db_documents
            if str(row.get("submission_group_id") or "").strip() == target_group_id
        ] or payload_documents or db_documents
    else:
        documents = payload_documents or db_documents
    if not documents and stage_row.get("document_url"):
        documents = [
            {
                "id": None,
                "document_url": stage_row.get("document_url") or payload.document_url or "",
                "document_name": stage_row.get("document_name") or payload.document_name or "",
                "document_public_id": stage_row.get("document_public_id") or "",
                "submission_group_id": target_group_id,
                "document_review_status": "pending",
                "document_review_feedback": "",
                "document_reviewed_at": None,
                "created_at": None,
            }
        ]

    review_lock_key = "|".join([
        "stage_document_review",
        str(user.id),
        progress.project_name,
        str(payload.step_number),
        str(payload.stage_index),
        target_group_id or str(stage_row.get("document_url") or payload.document_url or ""),
    ])
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"), {"lock_key": review_lock_key})
    reviewed_progress = db.execute(
        text(
            """
            SELECT status, document_review_status, document_review_feedback, document_reviewed_at,
                   document_url, document_name
            FROM project_stage_progress
            WHERE user_id = :user_id
              AND project_name = :project_name
              AND step_number = :step_number
              AND stage_index = :stage_index
            LIMIT 1
            """
        ),
        {
            "user_id": user.id,
            "project_name": progress.project_name,
            "step_number": payload.step_number,
            "stage_index": payload.stage_index,
        },
    ).mappings().first() or {}
    existing_review_status = str(reviewed_progress.get("document_review_status") or "").strip().lower()
    existing_review_feedback = str(reviewed_progress.get("document_review_feedback") or "").strip()
    if existing_review_status in {"approved", "rejected"}:
        passed = existing_review_status == "approved" and str(reviewed_progress.get("status") or "").strip().lower() == "completed"
        feedback = existing_review_feedback or (
            "Document review passed." if existing_review_status == "approved" else "Document review needs revision."
        )
        prefix = "Document review passed." if existing_review_status == "approved" else "Document review needs revision."
        chat_message = f"{prefix}\n\n{feedback}"
        reviewed_documents = [
            {
                **doc,
                "document_review_status": existing_review_status,
                "document_review_feedback": feedback,
                "document_reviewed_at": reviewed_progress.get("document_reviewed_at"),
            }
            for doc in documents
        ]
        return {
            "passed": passed,
            "already_reviewed": True,
            "review": {
                "status": "pass" if existing_review_status == "approved" else "fail",
                "score": 100 if existing_review_status == "approved" else 0,
                "safe_student_feedback": feedback,
                "missing_items": [],
                "weak_areas": [],
                "strengths": [],
            },
            "message": chat_message,
            "stage": {
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
                "status": reviewed_progress.get("status") or ("completed" if passed else "working"),
                "understood": True,
                "document_required": True,
                "document_url": reviewed_progress.get("document_url") or stage_row.get("document_url") or "",
                "document_name": reviewed_progress.get("document_name") or stage_row.get("document_name") or "",
                "documents": reviewed_documents,
                "document_review_status": existing_review_status,
                "document_review_feedback": feedback,
            },
        }

    precheck_payload = {
        "user_id": user.id,
        "project_name": progress.project_name,
        "step_number": payload.step_number,
        "stage_index": payload.stage_index,
        "stage_title": payload.stage_title or "",
        "objective": payload.objective or "",
        "deliverable": payload.deliverable or "",
        "stage_context": payload.stage_context or "",
        "document_url": stage_row.get("document_url") or payload.document_url or "",
        "document_name": stage_row.get("document_name") or payload.document_name or "",
        "documents": documents,
    }
    precheck_artifacts = build_stage_document_review_artifacts(precheck_payload)
    oversized_documents = (precheck_artifacts.get("validation") or {}).get("oversized_documents") or []
    if oversized_documents:
        names = [
            str(item.get("document_name") or "Document").strip()
            for item in oversized_documents
            if isinstance(item, dict)
        ]
        shown_names = ", ".join(name for name in names[:3] if name) or "the uploaded document"
        feedback = (
            f"Please re-upload a shorter document. {shown_names} has more than {MAX_UPLOADED_DOCUMENT_CHARS:,} extracted characters, "
            "so I cannot review it safely. Keep the document at or below this limit and upload it again."
        )
        if target_group_id:
            db.execute(
                text(
                    """
                    UPDATE project_stage_documents
                    SET document_review_status = 'not_submitted',
                        document_review_feedback = :feedback,
                        document_reviewed_at = NULL,
                        updated_at = NOW()
                    WHERE user_id = :user_id
                      AND project_name = :project_name
                      AND step_number = :step_number
                      AND stage_index = :stage_index
                      AND submission_group_id = :submission_group_id
                    """
                ),
                {
                    "feedback": feedback,
                    "user_id": user.id,
                    "project_name": progress.project_name,
                    "step_number": payload.step_number,
                    "stage_index": payload.stage_index,
                    "submission_group_id": target_group_id,
                },
            )
        else:
            cutoff = stage_row.get("document_reviewed_at") or stage_row.get("updated_at") or stage_row.get("started_at")
            db.execute(
                text(
                    """
                    UPDATE project_stage_documents
                    SET document_review_status = 'not_submitted',
                        document_review_feedback = :feedback,
                        document_reviewed_at = NULL,
                        updated_at = NOW()
                    WHERE user_id = :user_id
                      AND project_name = :project_name
                      AND step_number = :step_number
                      AND stage_index = :stage_index
                      AND created_at >= COALESCE(:cutoff, created_at)
                    """
                ),
                {
                    "feedback": feedback,
                    "user_id": user.id,
                    "project_name": progress.project_name,
                    "step_number": payload.step_number,
                    "stage_index": payload.stage_index,
                    "cutoff": cutoff,
                },
            )
        db.execute(
            text(
                """
                UPDATE project_stage_progress
                SET status = 'working',
                    understood = TRUE,
                    document_required = TRUE,
                    document_review_status = 'not_submitted',
                    document_review_feedback = :feedback,
                    document_reviewed_at = NULL,
                    completed_at = NULL,
                    updated_at = NOW()
                WHERE user_id = :user_id
                  AND project_name = :project_name
                  AND step_number = :step_number
                  AND stage_index = :stage_index
                """
            ),
            {
                "feedback": feedback,
                "user_id": user.id,
                "project_name": progress.project_name,
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
            },
        )
        reviewed_documents = [
            {
                **doc,
                "document_review_status": "not_submitted",
                "document_review_feedback": feedback,
                "document_reviewed_at": None,
            }
            for doc in documents
        ]
        assistant_row = _save_chat_message(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="assistant",
            message=feedback,
            agent_key=payload.preferred_agent or "pm",
            agent_name="Mentor",
            mentor_id=None,
            metadata={
                "kind": "stage_document_size_validation",
                "stage_key": str(payload.stage_key or "").strip(),
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
                "document_review_status": "not_submitted",
                "max_uploaded_document_chars": MAX_UPLOADED_DOCUMENT_CHARS,
                "oversized_documents": oversized_documents,
            },
        )
        db.commit()
        append_cached_messages(user.id, progress.project_name, [_serialize_chat_message(assistant_row)])
        return {
            "passed": False,
            "size_validation_failed": True,
            "review": {
                "status": "fail",
                "score": 0,
                "safe_student_feedback": feedback,
                "missing_items": ["Upload a document with 50,000 or fewer extracted characters."],
                "weak_areas": ["The uploaded document is too large for review."],
                "strengths": [],
            },
            "message": feedback,
            "stage": {
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
                "status": "working",
                "understood": True,
                "document_required": True,
                "document_url": stage_row.get("document_url") or "",
                "document_name": stage_row.get("document_name") or "",
                "documents": reviewed_documents,
                "document_review_status": "not_submitted",
                "document_review_feedback": feedback,
            },
        }
    cached_review_messages = []
    existing_upload_row = _find_stage_document_upload_message(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        stage_key=str(payload.stage_key or "").strip(),
        step_number=payload.step_number,
        stage_index=payload.stage_index,
        submission_group_id=target_group_id,
    )
    if not existing_upload_row:
        upload_row = _save_chat_message(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            role="user",
            message=_stage_document_upload_message(documents),
            agent_key="",
            agent_name="You",
            mentor_id=None,
            metadata={
                "kind": "stage_document_upload",
                "stage_key": str(payload.stage_key or "").strip(),
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
                "document_submission_group_id": target_group_id,
                "documents": documents,
            },
        )
        cached_review_messages.append(_serialize_chat_message(upload_row))

    review_mentor = _resolve_admin_mentor(db, payload.mentor_id, payload.preferred_agent)
    rag_question, rag_query_metadata = _build_stage_review_rag_question(
        project_name=progress.project_name,
        stage_title=payload.stage_title or "",
        objective=payload.objective or "",
        deliverable=payload.deliverable or "",
        stage_context=payload.stage_context or "",
        document_name=stage_row.get("document_name") or payload.document_name or "",
        documents=documents,
    )
    rag_started = time.perf_counter()
    rag_trace_step = {
        "step_name": "rag_retrieval_for_document_review",
        "status": "SUCCESS",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "end_time": "",
        "duration_ms": 0,
        "error_message": "",
        "warning_message": "",
    }
    review_rag_context = {"chunks": [], "documents": [], "context_text": ""}
    review_rag_error = ""
    try:
        max_chunks, max_context_chars = rag_limits_for_message(rag_question)
        min_score = 0.01
        review_rag_context = retrieve_agent_context(
            db,
            project_name=progress.project_name,
            mentor_id=review_mentor.get("id"),
            backend_agent_key=review_mentor.get("backend_key") or payload.preferred_agent or "",
            question=rag_question,
            max_chunks=max_chunks,
            max_context_chars=max_context_chars,
            min_relevance_score=min_score,
            lexical_only=True,
        )
        rag_chunks = review_rag_context.get("chunks") or []
        rag_trace_step["status"] = "SUCCESS" if rag_chunks else "SKIPPED"
        rag_trace_step["warning_message"] = "" if rag_chunks else "No matching indexed project document chunks were retrieved."
        rag_trace_step["rag_max_chunks"] = max_chunks
        rag_trace_step["rag_max_context_chars"] = max_context_chars
        rag_trace_step["rag_min_score"] = min_score
        rag_trace_step["rag_retrieval_mode"] = "local_lexical_no_embedding_api"
        rag_trace_step["rag_retrieved_chunks"] = len(rag_chunks)
        rag_trace_step["rag_global_chunks"] = sum(
            1 for chunk in rag_chunks if isinstance(chunk, dict) and chunk.get("source_scope") == "global_category"
        )
        rag_trace_step["rag_project_chunks"] = sum(
            1 for chunk in rag_chunks if isinstance(chunk, dict) and chunk.get("source_scope") != "global_category"
        )
        rag_trace_step["rag_document_snippets_used"] = rag_query_metadata.get("document_snippets_used", 0)
        rag_trace_step["rag_document_snippet_chars"] = rag_query_metadata.get("document_snippet_chars", 0)
        if rag_query_metadata.get("document_snippet_errors"):
            rag_trace_step["warning_message"] = (
                (rag_trace_step.get("warning_message") or "") + " Some submitted document snippets could not be read for retrieval."
            ).strip()
    except Exception as exc:
        logger.exception("Stage document review RAG retrieval failed.")
        review_rag_error = str(exc)
        rag_trace_step["status"] = "FAILED"
        rag_trace_step["error_message"] = review_rag_error
    rag_trace_step["end_time"] = datetime.now(timezone.utc).isoformat()
    rag_trace_step["duration_ms"] = round((time.perf_counter() - rag_started) * 1000, 2)

    project_row = (
        db.query(Project.id)
        .filter(func.lower(func.trim(Project.title)) == progress.project_name.lower().strip())
        .order_by(Project.id.desc())
        .first()
    )
    review_payload = {
        "user_id": user.id,
        "project_id": int(project_row[0]) if project_row else 0,
        "stage_id": payload.stage_index,
        "project_name": progress.project_name,
        "step_number": payload.step_number,
        "stage_index": payload.stage_index,
        "stage_title": payload.stage_title or "",
        "objective": payload.objective or "",
        "deliverable": payload.deliverable or "",
        "stage_context": payload.stage_context or "",
        "document_url": stage_row.get("document_url") or payload.document_url or "",
        "document_name": stage_row.get("document_name") or payload.document_name or "",
        "documents": documents,
        "rag_context": review_rag_context,
        "rag_error": review_rag_error,
        "rag_retrieval_trace": rag_trace_step,
        "prebuilt_artifacts": precheck_artifacts,
    }
    review = run_stage_document_review(review_payload)
    review_audit = review.pop("_audit", {}) if isinstance(review, dict) else {}
    if str(review.get("status") or "").strip().upper() == "REJECTED":
        review_feedback = str(review.get("message") or "Your document was rejected by AI content detection. Please revise and submit it again.")
        database_updates = {
            "records_updated": {},
            "stage_completed": False,
            "mentor_feedback_saved": False,
            "errors": [],
        }
        database_execution_flow = []
        if target_group_id:
            db_started = time.perf_counter()
            result = db.execute(
                text(
                    """
                    UPDATE project_stage_documents
                    SET document_review_status = 'rejected',
                        document_review_feedback = :feedback,
                        document_reviewed_at = NOW(),
                        updated_at = NOW()
                    WHERE user_id = :user_id
                      AND project_name = :project_name
                      AND step_number = :step_number
                      AND stage_index = :stage_index
                      AND submission_group_id = :submission_group_id
                    """
                ),
                {
                    "feedback": review_feedback,
                    "user_id": user.id,
                    "project_name": progress.project_name,
                    "step_number": payload.step_number,
                    "stage_index": payload.stage_index,
                    "submission_group_id": target_group_id,
                },
            )
        else:
            db_started = time.perf_counter()
            result = db.execute(
                text(
                    """
                    UPDATE project_stage_documents
                    SET document_review_status = 'rejected',
                        document_review_feedback = :feedback,
                        document_reviewed_at = NOW(),
                        updated_at = NOW()
                    WHERE user_id = :user_id
                      AND project_name = :project_name
                      AND step_number = :step_number
                      AND stage_index = :stage_index
                    """
                ),
                {
                    "feedback": review_feedback,
                    "user_id": user.id,
                    "project_name": progress.project_name,
                    "step_number": payload.step_number,
                    "stage_index": payload.stage_index,
                },
            )
        database_updates["records_updated"]["project_stage_documents"] = result.rowcount
        database_execution_flow.append({
            "step_name": "database_update_project_stage_documents",
            "status": "SUCCESS",
            "start_time": datetime.now(timezone.utc).isoformat(),
            "end_time": datetime.now(timezone.utc).isoformat(),
            "duration_ms": round((time.perf_counter() - db_started) * 1000, 2),
            "error_message": "",
            "warning_message": "AI content detection rejected the submission before mentor review.",
        })
        db_started = time.perf_counter()
        result = db.execute(
            text(
                """
                UPDATE project_stage_progress
                SET status = 'working',
                    understood = TRUE,
                    document_required = TRUE,
                    document_review_status = 'rejected',
                    document_review_feedback = :feedback,
                    document_reviewed_at = NOW(),
                    completed_at = NULL,
                    updated_at = NOW()
                WHERE user_id = :user_id
                  AND project_name = :project_name
                  AND step_number = :step_number
                  AND stage_index = :stage_index
                """
            ),
            {
                "feedback": review_feedback,
                "user_id": user.id,
                "project_name": progress.project_name,
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
            },
        )
        database_updates["records_updated"]["project_stage_progress"] = result.rowcount
        database_execution_flow.append({
            "step_name": "database_update_project_stage_progress",
            "status": "SUCCESS",
            "start_time": datetime.now(timezone.utc).isoformat(),
            "end_time": datetime.now(timezone.utc).isoformat(),
            "duration_ms": round((time.perf_counter() - db_started) * 1000, 2),
            "error_message": "",
            "warning_message": "Stage remains working because AI content detection rejected the document.",
        })
        review_audit["database_updates"] = database_updates
        review_audit["execution_flow"] = [
            *(review_audit.get("execution_flow") or []),
            *database_execution_flow,
            {
                "step_name": "database_insert_stage_document_review_audit",
                "status": "SUCCESS",
                "start_time": datetime.now(timezone.utc).isoformat(),
                "end_time": datetime.now(timezone.utc).isoformat(),
                "duration_ms": 0,
                "error_message": "",
                "warning_message": "AI content detection audit insert recorded without mentor feedback.",
            },
        ]
        review_audit["database_updates"]["records_updated"]["stage_document_review_audits"] = 1
        _save_stage_document_review_audit(
            db,
            user_id=user.id,
            project_name=progress.project_name,
            step_number=payload.step_number,
            stage_index=payload.stage_index,
            submission_group_id=target_group_id,
            documents=documents,
            review_audit=review_audit,
            review_status="rejected",
            review_score=0,
            review_feedback=review_feedback,
            github_required=False,
            github_connected=True,
            stage_completed=False,
        )
        db.commit()
        return {
            "status": "REJECTED",
            "message": review_feedback,
            "ai_detection": review.get("ai_detection") or {},
            "stage": {
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
                "status": "working",
                "understood": True,
                "document_required": True,
                "document_url": stage_row.get("document_url") or "",
                "document_name": stage_row.get("document_name") or "",
                "documents": documents,
                "document_review_status": "rejected",
                "document_review_feedback": review_feedback,
            },
        }
    document_passed = review["status"] == "pass"
    github_required = _stage_requires_github_integration(
        db,
        progress.project_name,
        payload.step_number,
        payload.stage_index,
    )
    github_connected = _user_has_github_repository(db, user.id, progress.project_name) if github_required else True
    passed = document_passed and github_connected
    review_feedback = review["safe_student_feedback"]
    if document_passed and github_required and not github_connected:
        review_feedback = (
            f"{review_feedback}\n\nYour document is approved. Now connect your GitHub repository from the GitHub tab, then come back and mark this stage completed."
        )
    review_status = "approved" if document_passed else "rejected"
    database_updates = {
        "records_updated": {},
        "stage_completed": False,
        "mentor_feedback_saved": False,
        "errors": [],
    }
    database_execution_flow = []
    if target_group_id:
        db_started = time.perf_counter()
        db_step = {
            "step_name": "database_update_project_stage_documents",
            "status": "SUCCESS",
            "start_time": datetime.now(timezone.utc).isoformat(),
            "end_time": "",
            "duration_ms": 0,
            "error_message": "",
            "warning_message": "",
        }
        result = db.execute(
            text(
                """
                UPDATE project_stage_documents
                SET document_review_status = :review_status,
                    document_review_feedback = :feedback,
                    document_reviewed_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = :user_id
                  AND project_name = :project_name
                  AND step_number = :step_number
                  AND stage_index = :stage_index
                  AND submission_group_id = :submission_group_id
                """
            ),
            {
                "review_status": review_status,
                "feedback": review_feedback,
                "user_id": user.id,
                "project_name": progress.project_name,
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
                "submission_group_id": target_group_id,
            },
        )
        database_updates["records_updated"]["project_stage_documents"] = result.rowcount
        db_step["end_time"] = datetime.now(timezone.utc).isoformat()
        db_step["duration_ms"] = round((time.perf_counter() - db_started) * 1000, 2)
        database_execution_flow.append(db_step)
    else:
        cutoff = stage_row.get("document_reviewed_at") or stage_row.get("updated_at") or stage_row.get("started_at")
        db_started = time.perf_counter()
        db_step = {
            "step_name": "database_update_project_stage_documents",
            "status": "SUCCESS",
            "start_time": datetime.now(timezone.utc).isoformat(),
            "end_time": "",
            "duration_ms": 0,
            "error_message": "",
            "warning_message": "No submission_group_id was available; updated documents by stage and cutoff.",
        }
        result = db.execute(
            text(
                """
                UPDATE project_stage_documents
                SET document_review_status = :review_status,
                    document_review_feedback = :feedback,
                    document_reviewed_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = :user_id
                  AND project_name = :project_name
                  AND step_number = :step_number
                  AND stage_index = :stage_index
                  AND created_at >= COALESCE(:cutoff, created_at)
                """
            ),
            {
                "review_status": review_status,
                "feedback": review_feedback,
                "user_id": user.id,
                "project_name": progress.project_name,
                "step_number": payload.step_number,
                "stage_index": payload.stage_index,
                "cutoff": cutoff,
            },
        )
        database_updates["records_updated"]["project_stage_documents"] = result.rowcount
        db_step["end_time"] = datetime.now(timezone.utc).isoformat()
        db_step["duration_ms"] = round((time.perf_counter() - db_started) * 1000, 2)
        database_execution_flow.append(db_step)
    db_started = time.perf_counter()
    db_step = {
        "step_name": "database_update_project_stage_progress",
        "status": "SUCCESS",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "end_time": "",
        "duration_ms": 0,
        "error_message": "",
        "warning_message": "",
    }
    result = db.execute(
        text(
            """
            UPDATE project_stage_progress
            SET status = :status,
                understood = TRUE,
                document_required = TRUE,
                document_review_status = :review_status,
                document_review_feedback = :feedback,
                document_reviewed_at = NOW(),
                completed_at = CASE WHEN :passed THEN COALESCE(completed_at, NOW()) ELSE NULL END,
                updated_at = NOW()
            WHERE user_id = :user_id
              AND project_name = :project_name
              AND step_number = :step_number
              AND stage_index = :stage_index
            """
        ),
        {
            "status": "completed" if passed else "working",
            "review_status": review_status,
            "feedback": review_feedback,
            "passed": passed,
            "user_id": user.id,
            "project_name": progress.project_name,
            "step_number": payload.step_number,
            "stage_index": payload.stage_index,
        },
    )
    database_updates["records_updated"]["project_stage_progress"] = result.rowcount
    database_updates["stage_completed"] = bool(passed)
    db_step["end_time"] = datetime.now(timezone.utc).isoformat()
    db_step["duration_ms"] = round((time.perf_counter() - db_started) * 1000, 2)
    database_execution_flow.append(db_step)
    review_audit["database_updates"] = database_updates
    review_audit["execution_flow"] = [
        *(review_audit.get("execution_flow") or []),
        *database_execution_flow,
    ]
    admin_mentor = review_mentor
    agent_key = admin_mentor.get("backend_key") or payload.preferred_agent or "pm"
    agent_name = admin_mentor.get("name") or "Mentor"
    if document_passed and github_required and not github_connected:
        prefix = "Document review passed. GitHub connection is still required."
    else:
        prefix = "Document review passed." if passed else "Document review needs revision."
    chat_message = f"{prefix}\n\nScore: {review['score']}/100\n\n{review['safe_student_feedback']}"
    if review.get("missing_items"):
        chat_message += "\n\nImprove:\n- " + "\n- ".join(review["missing_items"][:4])
    assistant_row = _save_chat_message(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        role="assistant",
        message=chat_message,
        agent_key=agent_key,
        agent_name=agent_name,
        mentor_id=admin_mentor.get("id"),
        metadata={
            "stage_key": str(payload.stage_key or "").strip(),
            "step_number": payload.step_number,
            "stage_index": payload.stage_index,
            "preferred_agent": payload.preferred_agent,
            "document_review_status": "approved" if passed else "rejected",
        },
    )
    review_audit["database_updates"]["mentor_feedback_saved"] = True
    review_audit["database_updates"]["records_updated"]["mentor_chat_messages"] = 1
    review_audit["database_updates"]["records_updated"]["stage_document_review_audits"] = 1
    review_audit["execution_flow"].append({
        "step_name": "database_insert_mentor_feedback_message",
        "status": "SUCCESS",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "end_time": datetime.now(timezone.utc).isoformat(),
        "duration_ms": 0,
        "error_message": "",
        "warning_message": "",
    })
    review_audit["execution_flow"].append({
        "step_name": "database_insert_stage_document_review_audit",
        "status": "SUCCESS",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "end_time": datetime.now(timezone.utc).isoformat(),
        "duration_ms": 0,
        "error_message": "",
        "warning_message": "This step is recorded immediately before the audit insert is attempted.",
    })
    _save_stage_document_review_audit(
        db,
        user_id=user.id,
        project_name=progress.project_name,
        step_number=payload.step_number,
        stage_index=payload.stage_index,
        submission_group_id=target_group_id,
        documents=documents,
        review_audit=review_audit,
        review_status=review_status,
        review_score=int(review.get("score") or 0),
        review_feedback=review_feedback,
        github_required=github_required,
        github_connected=github_connected,
        stage_completed=passed,
    )
    db.commit()
    cached_review_messages.append(_serialize_chat_message(assistant_row))
    append_cached_messages(user.id, progress.project_name, cached_review_messages)
    return {
        "passed": passed,
        "review": review,
        "message": chat_message,
        "stage": {
            "step_number": payload.step_number,
            "stage_index": payload.stage_index,
            "status": "completed" if passed else "working",
            "understood": True,
            "document_required": True,
            "document_url": stage_row.get("document_url") or "",
            "document_name": stage_row.get("document_name") or "",
            "documents": documents,
            "document_review_status": review_status,
            "document_review_feedback": review_feedback,
        },
    }
