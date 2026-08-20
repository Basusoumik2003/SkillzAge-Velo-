from typing import Dict, Optional

from app.services.crew_runner import run_crew


VALID_AGENTS = {"pm", "tech_lead", "architect", "qa"}
AGENT_LABELS = {
    "pm": "Mentor",
    "tech_lead": "Mentor",
    "architect": "Mentor",
    "qa": "Mentor",
}


def infer_agent_from_message(context: Dict) -> dict:
    text = (context.get("student_message") or "").lower()

    pm_keywords = [
        "start",
        "roadmap",
        "milestone",
        "scope",
        "plan",
        "breakdown",
        "requirement",
        "requirements",
        "next task",
        "next step",
        "workflow",
    ]
    tech_keywords = [
        "code",
        "implement",
        "bug",
        "error",
        "fix",
        "api",
        "database",
        "schema",
        "query",
        "endpoint",
        "debug",
        "frontend",
        "backend",
        "function",
        "logic",
    ]
    architect_keywords = [
        "database",
        "schema",
        "architecture",
        "system design",
        "diagram",
        "entity",
        "relationship",
        "data flow",
        "scalability",
        "component",
        "module boundary",
    ]
    qa_keywords = [
        "test",
        "testing",
        "edge case",
        "validation",
        "acceptance criteria",
        "qa",
        "quality check",
        "bug discovery",
        "failure scenario",
    ]

    if any(word in text for word in qa_keywords):
        return {"selected_agent": "qa", "reason": "User is asking about testing, validation, or edge cases."}
    if any(word in text for word in architect_keywords):
        return {"selected_agent": "architect", "reason": "User is asking about architecture, database design, or system boundaries."}
    if any(word in text for word in tech_keywords):
        return {"selected_agent": "tech_lead", "reason": "User is asking about implementation, debugging, or application logic."}
    if any(word in text for word in pm_keywords):
        return {"selected_agent": "pm", "reason": "User is asking about planning, requirements, or next-stage guidance."}

    return {"selected_agent": "pm", "reason": "Defaulting to PM guidance for stage planning and task direction."}


def route_agent(context: Dict, preferred_agent: Optional[str] = None) -> Dict[str, str]:
    selected = preferred_agent if preferred_agent in VALID_AGENTS else None
    routing = {"selected_agent": selected, "reason": "Using preferred agent override."} if selected else infer_agent_from_message(context)
    result = run_crew(context=context, target_agent=routing["selected_agent"])
    return {
        "agent": result.get("agent", AGENT_LABELS.get(routing["selected_agent"], "Mentor")),
        "message": result.get("message", "Let's continue step by step."),
        "reason": routing["reason"],
    }
