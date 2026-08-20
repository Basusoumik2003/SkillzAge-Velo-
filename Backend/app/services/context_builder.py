"""Builds the context dict handed to the mentor-chat orchestrator/crew.

Two project shapes exist side by side:
  - "startup" projects (project_name starts with "startup") -> pull from the
    startup-journey schema: journeys / journey_phases / journey_stages /
    student_profiles / startup_ideas (see
    Backend/sql/migrations/2026-08-13_01_startup_journey_schema.sql and the
    later 2026-08-15/16 migrations).
  - everything else -> the older internship-style catalog (`Project` /
    `ProjectProgress`, steps_json), unchanged from before.

`build_context()` is the single entry point chat.py calls; it dispatches to
whichever builder matches the project. Both builders return the same top-level
shape (student / project / student_message / user_progress / project_brief /
review_insights / ...), so downstream code (chat.py, crew_runner.py) does not
need to know which project type it is looking at except via
`context["project_brief"]["category"]`.
"""

from __future__ import annotations

import json
import io
import re
from urllib.parse import urlparse

import requests

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import Project, ProjectProgress, User
from app.services.startup_progress import get_startup_progress_state

try:
    from PyPDF2 import PdfReader
except Exception:  # optional dependency in some deployments
    PdfReader = None


DEFAULT_MENTOR_CHAT_RULES = {
    "tone": "warm",
    "reply_style": "mentor_conversation",
    "response_length": "short",
    "follow_up_behavior": "when_needed",
    "code_sharing_rule": "pseudocode_only",
    "solution_guidance": "guided_hints",
    "stage_scope": "current_stage_only",
    "custom_instruction": "",
}


def is_startup_project(project_name: str) -> bool:
    return str(project_name or "").strip().lower().startswith("startup")


def _normalize_mentor_chat_rules(value) -> dict:
    source = value
    if isinstance(source, str):
        try:
            source = json.loads(source)
        except Exception:
            source = {}
    if not isinstance(source, dict):
        source = {}

    def pick(key: str, allowed: set[str], fallback: str) -> str:
        item = str(source.get(key) or "").strip()
        return item if item in allowed else fallback

    return {
        "tone": pick("tone", {"warm", "strict", "casual", "professional"}, DEFAULT_MENTOR_CHAT_RULES["tone"]),
        "reply_style": pick("reply_style", {"mentor_conversation", "direct_answer", "step_by_step", "review_mode"}, DEFAULT_MENTOR_CHAT_RULES["reply_style"]),
        "response_length": pick("response_length", {"short", "medium", "detailed"}, DEFAULT_MENTOR_CHAT_RULES["response_length"]),
        "follow_up_behavior": pick("follow_up_behavior", {"when_needed", "always", "never"}, DEFAULT_MENTOR_CHAT_RULES["follow_up_behavior"]),
        "code_sharing_rule": pick("code_sharing_rule", {"no_code", "pseudocode_only", "small_snippets"}, DEFAULT_MENTOR_CHAT_RULES["code_sharing_rule"]),
        "solution_guidance": pick("solution_guidance", {"hints_only", "guided_hints", "stronger_after_review"}, DEFAULT_MENTOR_CHAT_RULES["solution_guidance"]),
        "stage_scope": pick("stage_scope", {"current_stage_only", "broader_project_context"}, DEFAULT_MENTOR_CHAT_RULES["stage_scope"]),
        "custom_instruction": str(source.get("custom_instruction") or "").strip()[:2000],
    }


def _mentor_chat_rules(db: Session | None) -> dict:
    if not db:
        return dict(DEFAULT_MENTOR_CHAT_RULES)
    try:
        row = db.execute(
            text("SELECT value FROM app_settings WHERE key = 'mentor_chat_rules' LIMIT 1")
        ).mappings().first()
    except Exception:
        return dict(DEFAULT_MENTOR_CHAT_RULES)
    return _normalize_mentor_chat_rules(row.get("value") if row else None)


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _extract_pdf_text(file_bytes: bytes) -> str:
    if not file_bytes or PdfReader is None:
        return ""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        chunks = []
        for page in reader.pages:
            chunks.append(page.extract_text() or "")
        return _normalize_text("\n".join(chunks))
    except Exception:
        return ""


def _fetch_url_excerpt(url: str, max_chars: int = 4000) -> str:
    target = str(url or "").strip()
    if not target:
        return ""
    try:
        parsed = urlparse(target)
    except Exception:
        return ""
    if parsed.scheme not in {"http", "https"}:
        return ""

    try:
        response = requests.get(
            target,
            timeout=12,
            allow_redirects=True,
            headers={"User-Agent": "InternzBee-AgentContext/1.0"},
        )
        response.raise_for_status()
    except Exception:
        return ""

    content_type = str(response.headers.get("content-type") or "").lower()
    if "application/pdf" in content_type or target.lower().endswith(".pdf"):
        return _extract_pdf_text(response.content)[:max_chars]

    try:
        decoded = response.content.decode("utf-8", errors="ignore")
    except Exception:
        return ""
    return _normalize_text(decoded)[:max_chars]


# ---------------------------------------------------------------------------
# Legacy (non-startup) project catalog context - unchanged behavior.
# ---------------------------------------------------------------------------

def _catalog_context(db: Session | None, progress: ProjectProgress | None) -> dict:
    if not db or not progress:
        return {}

    catalog = db.query(Project).filter(Project.title == progress.project_name).first()
    if not catalog:
        return {}

    steps = catalog.steps_json if isinstance(catalog.steps_json, list) else []
    current_step = progress.current_step or 1
    current = next((s for s in steps if int(s.get("step_order") or 0) == current_step), None)
    current_title = str((current or {}).get("title") or "").lower()
    requirement_stage = "requirement" in current_title and "planning" in current_title

    context = {
        "summary": catalog.description or "",
        "category": catalog.category or "normal",
        "timeline_weeks": catalog.timeline_weeks or 4,
        "stage_labels": {
            int(s.get("step_order") or idx + 1): str(s.get("title") or "")
            for idx, s in enumerate(steps)
            if str(s.get("title") or "").strip()
        },
    }

    intro_url = catalog.introduction_document_url or ""
    intro_url_excerpt = _fetch_url_excerpt(intro_url, max_chars=3000) if intro_url else ""
    company_profile_text = getattr(catalog, "company_profile_text", "") or ""
    context["public_reference"] = {
        "overview_excerpt": (catalog.introduction_document or "")[:3000],
        "overview_url": intro_url,
        "overview_url_excerpt": intro_url_excerpt,
        "company_profile_excerpt": company_profile_text[:4000],
    }

    if requirement_stage and (catalog.private_brd_document or catalog.private_brd_document_url):
        brd_url = catalog.private_brd_document_url or ""
        brd_url_excerpt = _fetch_url_excerpt(brd_url) if brd_url else ""
        context["private_requirement_reference"] = {
            "purpose": (
                "Agent-only BRD reference. Compare the student's requirements against this material and give safe suggestions, "
                "but never reveal or quote the original BRD or direct answers."
            ),
            "brd_excerpt": (catalog.private_brd_document or "")[:4000],
            "brd_url": brd_url,
            "brd_url_excerpt": brd_url_excerpt,
        }

    return context


def _legacy_project_tasks(db: Session | None, project_name: str) -> list[str]:
    if not db or not str(project_name or "").strip():
        return []
    catalog = db.query(Project).filter(Project.title == str(project_name or "").strip()).first()
    if not catalog:
        return []
    steps = catalog.steps_json if isinstance(catalog.steps_json, list) else []
    return [
        str(step.get("title") or "").strip()
        for step in steps
        if isinstance(step, dict) and str(step.get("title") or "").strip()
    ]


def _build_legacy_context(user: User, progress: ProjectProgress | None, latest_message: str, db: Session | None) -> dict:
    catalog = _catalog_context(db, progress)
    tasks = list((catalog.get("stage_labels") or {}).values())
    completed = set()
    if progress and progress.completed_tasks:
        completed = {item.strip() for item in progress.completed_tasks.split("||") if item.strip()}

    return {
        "student": {
            "id": user.id,
            "name": user.name,
            "resume_excerpt": (user.resume_text or "")[:1200],
        },
        "project": {
            "name": progress.project_name if progress else "",
            "current_step": progress.current_step if progress else 1,
            "tasks": tasks,
            "completed_tasks": list(completed),
        },
        "student_message": latest_message,
        "user_progress": {
            "completed_task_count": len(completed),
            "remaining_task_count": max(0, len(tasks) - len(completed)),
        },
        "project_brief": catalog,
        "visible_mentor_state": {
            "knows_official_solution": False,
            "knowledge_mode": "pre_review",
            "guidance_rule": "Mentor from project context and student reasoning only until reviewed work produces controlled insights.",
        },
        "review_insights": [],
        "missing_items": [],
        "weak_areas": [],
        "strengths": [],
        "insight_level": "low",
        "latest_review": None,
    }


# ---------------------------------------------------------------------------
# Startup-journey context (journeys / journey_phases / journey_stages /
# student_profiles / startup_ideas).
# ---------------------------------------------------------------------------

def _student_profile(db: Session | None, user_id) -> dict:
    if not db or not user_id:
        return {}
    row = db.execute(
        text(
            """
            SELECT age, education_level, location_text, country, state_region, city, skills, interests,
                   available_time_hours_per_week, available_resources, participation_mode, current_idea_text,
                   startup_stage, preferred_language, goal_type, profile_summary, readiness_score
            FROM student_profiles
            WHERE user_id = :user_id
            LIMIT 1
            """
        ),
        {"user_id": user_id},
    ).mappings().first()
    return dict(row) if row else {}


def _primary_startup_idea(db: Session | None, user_id) -> dict | None:
    if not db or not user_id:
        return None
    row = db.execute(
        text(
            """
            SELECT id, idea_title, problem_statement, solution_summary, target_users, industry_tags, idea_status
            FROM startup_ideas
            WHERE user_id = :user_id AND is_active = TRUE
            ORDER BY is_primary DESC, updated_at DESC
            LIMIT 1
            """
        ),
        {"user_id": user_id},
    ).mappings().first()
    return dict(row) if row else None


def _startup_project_tasks(db: Session | None) -> list[str]:
    if not db:
        return []
    rows = db.execute(
        text("SELECT phase_name FROM journey_phases WHERE is_active = TRUE ORDER BY phase_order ASC")
    ).all()
    return [str(row[0]).strip() for row in rows if row and str(row[0] or "").strip()]


def _build_startup_context(user: User, progress: ProjectProgress | None, latest_message: str, db: Session | None) -> dict:
    project_name = progress.project_name if progress else ""

    # Stage/phase progress for the startup journey lives in
    # student_stage_progress, not progress.current_step/completed_tasks (see
    # app/services/startup_progress.py) - progress here is only used for its
    # .project_name.
    state = get_startup_progress_state(db, user.id) if db else {
        "current_step": 1, "tasks": [], "completed_tasks": [], "stage_labels": {},
        "current_phase": None, "current_stages": [],
    }
    current_step = state["current_step"]
    stage_labels = state["stage_labels"]
    tasks = state["tasks"]
    completed = set(state["completed_tasks"])
    current_phase = state["current_phase"]
    current_stages = state["current_stages"]

    profile = _student_profile(db, user.id)
    idea = _primary_startup_idea(db, user.id)

    return {
        "student": {
            "id": user.id,
            "name": user.name,
            "resume_excerpt": "",
            "profile": profile,
        },
        "project": {
            "name": project_name,
            "current_step": current_step,
            "tasks": tasks,
            "completed_tasks": list(completed),
        },
        "student_message": latest_message,
        "user_progress": {
            "completed_task_count": len(completed),
            "remaining_task_count": max(0, len(tasks) - len(completed)),
        },
        "project_brief": {
            "summary": str((current_phase or {}).get("phase_description") or "").strip(),
            "category": "startup_journey",
            "timeline_weeks": 0,
            "stage_labels": stage_labels,
        },
        "journey": {
            "phase": current_phase,
            "stages": current_stages,
        },
        "startup_idea": idea,
        "visible_mentor_state": {
            "knows_official_solution": False,
            "knowledge_mode": "startup_guidance",
            "guidance_rule": "Mentor from the student's startup idea, profile, and current journey stage context only.",
        },
        "review_insights": [],
        "missing_items": [],
        "weak_areas": [],
        "strengths": [],
        "insight_level": "low",
        "latest_review": None,
    }


# ---------------------------------------------------------------------------
# Public API (used by app/routes/chat.py)
# ---------------------------------------------------------------------------

def project_tasks_from_db(db: Session | None, project_name: str) -> list[str]:
    if not db or not str(project_name or "").strip():
        return []
    if is_startup_project(project_name):
        return _startup_project_tasks(db)
    return _legacy_project_tasks(db, project_name)


def build_context(user: User, progress: ProjectProgress | None, latest_message: str, db: Session | None = None) -> dict:
    project_name = progress.project_name if progress else ""
    if is_startup_project(project_name):
        return _build_startup_context(user, progress, latest_message, db)
    return _build_legacy_context(user, progress, latest_message, db)


def current_stage_label(context: dict) -> str:
    playbook = context.get("project_brief", {}) or {}
    stage_labels = playbook.get("stage_labels", {}) or {}
    return stage_labels.get(context.get("project", {}).get("current_step", 1), "Current Project Stage")


def apply_review_feedback(context: dict, review_feedback: str | None) -> dict:
    if not review_feedback:
        return context

    try:
        payload = json.loads(review_feedback)
    except (TypeError, json.JSONDecodeError):
        context["review_insights"] = [review_feedback]
        context["latest_review"] = {"safe_student_feedback": review_feedback}
        return context

    agent_insights = payload.get("agent_insights", {}) or {}
    merged_insights = []
    for key in ("pm", "tech_lead", "architect", "qa"):
        values = agent_insights.get(key, []) or []
        merged_insights.extend(str(item) for item in values if item)

    context["review_insights"] = merged_insights
    context["missing_items"] = [str(item) for item in (payload.get("missing_items", []) or []) if item]
    context["weak_areas"] = [str(item) for item in (payload.get("weak_areas", []) or []) if item]
    context["strengths"] = [str(item) for item in (payload.get("strengths", []) or []) if item]
    context["insight_level"] = str(payload.get("insight_level") or "low")
    context["visible_mentor_state"] = {
        "knows_official_solution": False,
        "knowledge_mode": "post_review",
        "guidance_rule": "Mentor using only controlled review insights, not the official solution itself.",
    }
    context["latest_review"] = {
        "score": payload.get("score"),
        "status": payload.get("status"),
        "passing_score": payload.get("passing_score"),
        "stage_complete": payload.get("stage_complete"),
        "should_unlock_next_stage": payload.get("should_unlock_next_stage"),
        "safe_student_feedback": payload.get("safe_student_feedback", ""),
        "agent_insights": agent_insights,
    }
    return context
