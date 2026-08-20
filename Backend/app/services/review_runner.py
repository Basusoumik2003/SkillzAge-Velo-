"""Small shared helper for picking which OpenAI model a direct (non-CrewAI)
review/grading LLM call should use. Kept in its own module so both the
stage-document-review pipeline and any other direct-LLM caller resolve the
model the same way."""

from __future__ import annotations

from app.core.config import Settings


def _openai_review_model(settings: Settings) -> str:
    """Resolve the model name for direct review/grading LLM calls.

    Preference order: OPENAI_MENTOR_MODEL (if explicitly configured) ->
    OPENAI_LIGHT_MODEL -> OPENAI_MODEL. Mirrors the resolution order used
    by app/agents/agent_factory.py's _build_llm() so review calls and
    mentor-chat calls stay on the same model by default.
    """
    configured = str(settings.openai_mentor_model or "").strip()
    if configured and not configured.lower().startswith("your_"):
        return configured
    return str(settings.openai_light_model or settings.openai_model or "gpt-4o-mini").strip()
