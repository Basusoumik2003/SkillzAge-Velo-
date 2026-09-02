"""Runs one mentor turn: builds a system prompt from the resolved mentor
persona (context["admin_mentor"], set by chat.py before calling
orchestrator.route_agent -> here) plus a user prompt built from the rest of
the context dict (student profile, startup idea, active journey stage, RAG
chunks, review insights, recent conversation), and returns the reply.

Uses crewai's LLM wrapper for a single plain chat completion (see run_crew's
comment for why it does not use crewai's Agent/Task/Crew executor).

Kept deliberately independent of the DB - everything it needs is expected to
already be in `context` by the time orchestrator.route_agent() calls it.
"""

from __future__ import annotations

import logging
from typing import Any

from app.agents.agent_factory import _build_llm
from app.agents.common import COMMON_MENTOR_GUARDRAIL

logger = logging.getLogger(__name__)

FALLBACK_MENTOR = {
    "agent_key": "pm",
    "name": "Mentor",
    "role": "Startup Journey Mentor",
    "goal": "Guide the student through their current startup journey stage using their own idea and profile context.",
    "backstory": (
        "You are a supportive startup mentor for a student-founder journey. "
        "Guide with questions, hints, and reasoning steps - never hand over a finished plan, pitch, or document verbatim."
    ),
    "output_format": "markdown",
}

FALLBACK_REPLY = "Let's continue - could you tell me a bit more about where you're stuck on this stage?"


def _mentor_persona(context: dict[str, Any], target_agent: str) -> dict:
    mentor = context.get("admin_mentor") or {}
    if str(mentor.get("role") or "").strip() and str(mentor.get("backstory") or "").strip():
        return mentor
    return {**FALLBACK_MENTOR, "agent_key": target_agent or "pm"}


def _format_list(label: str, items: list[str] | None, *, limit: int = 6) -> str:
    values = [str(item).strip() for item in (items or []) if str(item or "").strip()]
    if not values:
        return ""
    return f"{label}:\n" + "\n".join(f"- {value}" for value in values[:limit])


def _build_task_description(context: dict[str, Any]) -> str:
    sections: list[str] = []

    student = context.get("student") or {}
    student_name = str(student.get("name") or "the student").strip()
    profile = student.get("profile") or {}
    idea = context.get("startup_idea") or {}
    active_stage = context.get("active_stage") or {}
    journey = context.get("journey") or {}
    stage_row = (journey.get("stages") or [None])[0] if journey.get("stages") else None

    sections.append(f"You are mentoring {student_name} in a startup journey conversation.")

    if profile:
        def _fmt(value, fallback):
            if isinstance(value, (list, tuple)):
                joined = ", ".join(str(v).strip() for v in value if str(v).strip())
                return joined or fallback
            return value or fallback

        profile_lines = [
            f"Startup stage: {profile.get('startup_stage') or 'unknown'}",
            f"Goals: {_fmt(profile.get('goal_type'), 'unknown')}",
            f"Skills: {_fmt(profile.get('skills'), 'not provided')}",
            f"Interests: {_fmt(profile.get('interests'), 'not provided')}",
            f"Available time: {profile.get('available_time_hours_per_week') or 0} hours/week",
        ]
        sections.append("STUDENT PROFILE:\n" + "\n".join(profile_lines))

    if idea:
        idea_lines = [
            f"Idea title: {idea.get('idea_title') or 'untitled'}",
            f"Problem: {idea.get('problem_statement') or 'not provided'}",
            f"Solution: {idea.get('solution_summary') or 'not provided'}",
            f"Target users: {idea.get('target_users') or 'not provided'}",
        ]
        sections.append("STUDENT'S STARTUP IDEA:\n" + "\n".join(idea_lines))

    stage_title = str(active_stage.get("stage_title") or (stage_row or {}).get("stage_name") or "").strip()
    stage_context = str(active_stage.get("stage_context") or (stage_row or {}).get("stage_context") or "").strip()
    objective = str(active_stage.get("objective") or (stage_row or {}).get("stage_objective") or "").strip()
    deliverable = str(active_stage.get("deliverable") or (stage_row or {}).get("expected_outcome") or "").strip()
    scope_rule = str(active_stage.get("scope_rule") or "").strip()
    if stage_title or objective or deliverable:
        stage_lines = [line for line in [
            f"Current stage: {stage_title}" if stage_title else "",
            f"Objective: {objective}" if objective else "",
            f"Expected deliverable: {deliverable}" if deliverable else "",
            f"Stage instructions: {stage_context}" if stage_context else "",
            f"Scope rule: {scope_rule}" if scope_rule else "",
        ] if line]
        sections.append("ACTIVE JOURNEY STAGE:\n" + "\n".join(stage_lines))

    rag_context = context.get("allowed_document_context") or {}
    if rag_context.get("context_text"):
        sections.append(
            "REFERENCE MATERIAL (use only if relevant, never quote large verbatim blocks):\n"
            + str(rag_context["context_text"])[:6000]
        )

    review_block = "\n".join(
        part for part in [
            _format_list("Review insights", context.get("review_insights")),
            _format_list("Missing items", context.get("missing_items")),
            _format_list("Weak areas", context.get("weak_areas")),
            _format_list("Strengths", context.get("strengths")),
        ] if part
    )
    if review_block:
        sections.append(f"REVIEW CONTEXT (insight_level={context.get('insight_level') or 'low'}):\n{review_block}")

    recent_conversation = context.get("recent_conversation") or []
    if recent_conversation:
        convo_lines = [f"{item.get('role', 'user')}: {item.get('message', '')}" for item in recent_conversation[-4:]]
        sections.append("RECENT CONVERSATION:\n" + "\n".join(convo_lines))

    sections.append(f"STUDENT'S CURRENT MESSAGE:\n{context.get('student_message') or ''}")
    sections.append(COMMON_MENTOR_GUARDRAIL.strip())
    sections.append(
        "Now write your reply to the student directly (no preamble like 'Here is my reply', no headers) - "
        "just the mentor message itself."
    )

    return "\n\n".join(section for section in sections if section)


def _mentor_system_prompt(mentor: dict[str, Any]) -> str:
    role = str(mentor.get("role") or mentor.get("name") or "Project Mentor").strip()
    goal = str(mentor.get("goal") or mentor.get("speciality") or "Guide the student with safe mentor-style feedback.").strip()
    backstory = str(mentor.get("backstory") or mentor.get("rules") or "").strip()
    if not backstory:
        backstory = "You are a safe mentor. Guide the student without revealing final answers or full solutions."
    return (
        f"You are acting as: {role}\n"
        f"Your goal: {goal}\n\n"
        f"{backstory}\n\n"
        f"{COMMON_MENTOR_GUARDRAIL.strip()}"
    )


def run_crew(*, context: dict[str, Any], target_agent: str) -> dict[str, str]:
    mentor = _mentor_persona(context, target_agent)
    message = ""
    try:
        # Deliberately bypass crewai's Agent/Task/Crew executor here: that
        # executor drives a ReAct (Thought/Action/Action Input) tool-use loop,
        # which this single-turn, tool-less mentor reply doesn't need - and a
        # plain conversational reply from the model doesn't match that format,
        # so the executor treats every reply as a parse failure and retries
        # forever, hammering the LLM without ever returning. LLM.call() does a
        # single plain chat completion instead, so it never enters that loop.
        llm = _build_llm()
        messages = [
            {"role": "system", "content": _mentor_system_prompt(mentor)},
            {"role": "user", "content": _build_task_description(context)},
        ]
        raw = llm.call(messages)
        message = str(raw or "").strip()
    except Exception:
        logger.exception("crew_runner.run_crew failed for target_agent=%s.", target_agent)

    return {
        "agent": str(mentor.get("name") or mentor.get("mentor_name") or "Mentor").strip(),
        "message": message or FALLBACK_REPLY,
        "reason": f"Routed to {target_agent or 'default'} mentor persona.",
    }
