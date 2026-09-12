from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Mapping

logger = logging.getLogger(__name__)

GLOBAL_VISIBLE_MENTOR_POLICY = (
    "Never generate full raw code or final solutions. Use a warm, natural mentor-conversation tone: "
    "acknowledge the student's message, guide one small step at a time, ask at most one focused follow-up, "
    "and avoid corporate, template-like, or emoji-heavy replies."
)

REQUIRED_FIELDS = ("agent_key", "mentor_name", "role", "goal", "backstory")

def _build_llm():
    # CrewAI 0.203 routes model calls through LiteLLM. LiteLLM needs the
    # provider prefix in the model name, so use CrewAI's LLM wrapper and keep
    # visible mentor runtime pinned to OpenAI.
    from app.core.config import get_settings
    from crewai import LLM

    settings = get_settings()
    configured_model = str(settings.openai_mentor_model or "").strip()
    if configured_model and not configured_model.lower().startswith("your_"):
        model = configured_model
    else:
        model = str(settings.openai_light_model or settings.openai_model).strip()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for mentor agents.")
    return LLM(
        model=f"openai/{model}",
        temperature=1,
        api_key=settings.openai_api_key,
    )


def _build_agent(*, role: str, goal: str, backstory: str, llm):
    # CrewAI import is intentionally lazy. This keeps DB fetch/diagnostic code
    # lightweight and avoids module import side effects before runtime.
    from crewai import Agent

    return Agent(
        role=role,
        goal=goal,
        backstory=backstory,
        verbose=False,
        allow_delegation=False,
        llm=llm,
    )


def build_agent_from_mentor_config(mentor: Mapping[str, Any], *, llm):
    """
    Build one visible CrewAI Agent from a serialized project_mentors row/config.

    This is used by runtime chat when the frontend sends a selected mentor_id.
    It keeps mentor behavior driven by DB role/goal/backstory instead of the
    older hardcoded PM/Architect/Tech/QA agent templates.
    """
    agent_key = str(mentor.get("agent_key") or mentor.get("backend_key") or "mentor").strip()
    role = str(mentor.get("role") or mentor.get("name") or "Project Mentor").strip()
    goal = str(mentor.get("goal") or mentor.get("speciality") or "Guide the student with safe mentor-style feedback.").strip()
    backstory = str(mentor.get("backstory") or mentor.get("rules") or "").strip()
    if not backstory:
        backstory = "You are a safe mentor. Guide the student without revealing final answers or full solutions."

    backstory = f"{backstory}\n\nGLOBAL POLICY:\n{GLOBAL_VISIBLE_MENTOR_POLICY}"
    return _build_agent(role=role, goal=goal, backstory=backstory, llm=llm)


def _cursor_columns(db_cursor) -> list[str]:
    description = getattr(db_cursor, "description", None) or []
    return [str(col[0]) for col in description if col and col[0]]


def _row_to_dict(row: Any, columns: list[str]) -> Dict[str, Any]:
    if isinstance(row, Mapping):
        return dict(row)

    if hasattr(row, "_mapping"):
        return dict(row._mapping)

    if columns and isinstance(row, (tuple, list)):
        return dict(zip(columns, row))

    raise ValueError("Unsupported mentor row format from database cursor.")


def _clean_required_text(row: Dict[str, Any], field: str, agent_key: str) -> str:
    value = row.get(field)
    if value is None:
        raise ValueError(f"Mentor '{agent_key}' is missing required field '{field}'.")

    text = str(value).strip()
    if not text:
        raise ValueError(f"Mentor '{agent_key}' has empty required field '{field}'.")
    return text


def _fetch_rows(db_cursor) -> Iterable[Any]:
    db_cursor.execute(
        """
        SELECT id, agent_key, mentor_name, role, goal, backstory, is_hidden, output_format
        FROM project_mentors
        ORDER BY is_hidden ASC, mentor_name ASC, id ASC
        """
    )
    return db_cursor.fetchall()


def fetch_and_build_agents(db_cursor) -> Dict[str, Agent]:
    """
    Read project_mentors rows from a DB cursor and build live CrewAI Agent objects.

    Returns:
        Dict keyed by agent_key, with CrewAI Agent instances as values.
    """
    agents: Dict[str, Agent] = {}

    try:
        rows = list(_fetch_rows(db_cursor))
        columns = _cursor_columns(db_cursor)
        if not rows:
            raise RuntimeError("project_mentors table is empty. Configure mentors in the database/admin panel.")
    except Exception as exc:
        logger.exception("Could not fetch project mentors from database.")
        raise RuntimeError("Failed to fetch project mentors from database.") from exc

    llm = _build_llm()

    for raw_row in rows:
        try:
            row = _row_to_dict(raw_row, columns)
            agent_key = str(row.get("agent_key") or "").strip()
            if not agent_key:
                raise ValueError("Mentor row is missing required field 'agent_key'.")

            role = _clean_required_text(row, "role", agent_key)
            goal = _clean_required_text(row, "goal", agent_key)
            backstory = _clean_required_text(row, "backstory", agent_key)
            is_hidden = bool(row.get("is_hidden", False))

            if not is_hidden:
                backstory = f"{backstory}\n\nGLOBAL POLICY:\n{GLOBAL_VISIBLE_MENTOR_POLICY}"

            agents[agent_key] = _build_agent(
                role=role,
                goal=goal,
                backstory=backstory,
                llm=llm,
            )
        except Exception as exc:
            logger.warning("Skipping invalid mentor row: %s", exc)

    if rows and not agents:
        raise RuntimeError("Mentor rows were found, but none could be converted into CrewAI Agent objects.")

    return agents
