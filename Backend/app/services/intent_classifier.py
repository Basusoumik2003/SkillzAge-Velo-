import re
from dataclasses import dataclass


INTENT_QUESTION = "QUESTION"
INTENT_SUBMISSION = "SUBMISSION"
INTENT_PROJECT_COMMAND = "PROJECT_COMMAND"
INTENT_LOW_INTENT = "LOW_INTENT"
INTENT_SOCIAL = "SOCIAL"
INTENT_OFF_TOPIC = "OFF_TOPIC"
INTENT_UNKNOWN = "UNKNOWN"

LOW_INTENT_RESPONSE = "It looks like your message may have been sent accidentally. Please let me know how I can assist you."
SOCIAL_RESPONSE = "Please let me know what you would like help with next."
OFF_TOPIC_RESPONSE = "I can't help with that here. Let's stick to your current project stage, deliverable, or review feedback."
UNKNOWN_RESPONSE = "I am not certain what you would like assistance with. Could you please provide additional information or clarify your request?"

OVERLOADED_QUESTION_RESPONSES = [
    "Good questions. Let's take them one at a time so we can understand each properly. Which one would you like to start with?",
    "You've raised some important points. Let's go step by step and focus on the one that matters most first.",
    "There's a lot to cover here. Let's pick one question first and work through it properly before moving ahead.",
    "Let's not rush through everything at once. Start with the question you're most curious about, and we'll take it from there.",
    "Good thinking. We'll handle each point one by one. Tell me where you'd like to begin.",
]

_PROJECT_COMMANDS = {
    "continue",
    "next",
    "next step",
    "next task",
    "next phase",
    "next stage",
    "go ahead",
    "proceed",
    "move forward",
    "continue to next stage",
    "continue to next phase",
    "generate next deliverable",
    "move to the next activity",
}

_LOW_INTENT_PHRASES = {
    "ok",
    "okay",
    "k",
    "yes",
    "y",
    "no",
    "n",
    "hmm",
    "hmmm",
    "fine",
    "cool",
    "great",
    "nice",
    "maybe",
    "sure",
    "good",
    "alright",
}

_SOCIAL_PHRASES = {
    "hi",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
    "thanks",
    "thank you",
}

_QUESTION_STARTERS = {
    "what",
    "why",
    "how",
    "when",
    "where",
    "which",
    "who",
    "can",
    "could",
    "should",
    "would",
    "is",
    "are",
    "do",
    "does",
    "did",
    "explain",
    "help",
    "guide",
}

_SUBMISSION_MARKERS = {
    "submitted",
    "submission",
    "attached",
    "uploaded",
    "completed",
    "finished",
    "deliverable",
    "report",
    "document",
    "my answer",
    "my work",
}

_PROJECT_KEYWORDS = {
    "api",
    "backend",
    "bug",
    "code",
    "component",
    "database",
    "debug",
    "design",
    "endpoint",
    "error",
    "feature",
    "frontend",
    "implementation",
    "logic",
    "plan",
    "project",
    "requirement",
    "requirements",
    "schema",
    "stage",
    "task",
    "test",
    "testing",
    "workflow",
}

_OFF_TOPIC_KEYWORDS = {
    "boyfriend",
    "cafe",
    "crush",
    "date",
    "dating",
    "dinner",
    "flirt",
    "friendship",
    "girlfriend",
    "girl",
    "love",
    "marriage",
    "movie",
    "party",
    "personal",
    "propose",
    "proposal",
    "relationship",
    "restaurant",
    "romance",
    "travel",
    "trip",
}

_PUNCTUATION_ONLY = re.compile(r"^[\s\.,?!\-_/*`'\"\\|:;()\[\]{}<>@#$%^&+=~]+$")
_DIGITS_ONLY = re.compile(r"^\d+$")
_STRETCHED_GREETING = re.compile(r"^(h+i+|h+e+y+|h+e+l+o+)$")


@dataclass(frozen=True)
class IntentClassification:
    intent: str
    response: str | None = None


def _normalize(message: str | None) -> str:
    return re.sub(r"\s+", " ", str(message or "")).strip().lower()


def _has_project_signal(text: str) -> bool:
    return any(keyword in text for keyword in _PROJECT_KEYWORDS)


def _is_off_topic(text: str) -> bool:
    if _has_project_signal(text):
        return False
    return any(keyword in text for keyword in _OFF_TOPIC_KEYWORDS)


def overloaded_question_response(message: str | None) -> str | None:
    text = _normalize(message)
    if not text:
        return None

    words = text.split()
    question_marks = text.count("?")
    starter_hits = sum(1 for word in words if word.strip(".,?!:;") in _QUESTION_STARTERS)
    connector_hits = len(re.findall(r"\b(and|also|then|plus|another|second|third|next|what about|how about)\b", text))
    comma_clauses = text.count(",")

    overloaded = (
        question_marks >= 2
        or (len(words) >= 22 and starter_hits >= 2)
        or (len(words) >= 28 and connector_hits >= 2 and (question_marks >= 1 or starter_hits >= 1))
        or (len(words) >= 35 and comma_clauses >= 3 and starter_hits >= 1)
    )
    if not overloaded:
        return None

    seed = sum(ord(ch) for ch in text)
    return OVERLOADED_QUESTION_RESPONSES[seed % len(OVERLOADED_QUESTION_RESPONSES)]


def classify_message_intent(message: str | None) -> IntentClassification:
    text = _normalize(message)
    compact = re.sub(r"\s+", "", text)

    if not text:
        return IntentClassification(INTENT_LOW_INTENT, LOW_INTENT_RESPONSE)

    if text in _PROJECT_COMMANDS:
        return IntentClassification(INTENT_PROJECT_COMMAND)

    if len(compact) == 1:
        return IntentClassification(INTENT_LOW_INTENT, LOW_INTENT_RESPONSE)

    if len(compact) <= 16 and _PUNCTUATION_ONLY.match(text):
        return IntentClassification(INTENT_LOW_INTENT, LOW_INTENT_RESPONSE)

    if len(compact) <= 12 and (_DIGITS_ONLY.match(compact) or compact in {"asdf", "qwerty", "test"}):
        return IntentClassification(INTENT_LOW_INTENT, LOW_INTENT_RESPONSE)

    if text in _LOW_INTENT_PHRASES:
        return IntentClassification(INTENT_LOW_INTENT, LOW_INTENT_RESPONSE)

    if text in _SOCIAL_PHRASES or _STRETCHED_GREETING.match(compact):
        return IntentClassification(INTENT_SOCIAL, SOCIAL_RESPONSE)

    if _is_off_topic(text):
        return IntentClassification(INTENT_OFF_TOPIC, OFF_TOPIC_RESPONSE)

    words = text.split()
    first_word = words[0] if words else ""

    if "?" in text or first_word in _QUESTION_STARTERS:
        return IntentClassification(INTENT_QUESTION)

    if any(marker in text for marker in _SUBMISSION_MARKERS):
        return IntentClassification(INTENT_SUBMISSION)

    if len(words) <= 2 and not _has_project_signal(text):
        return IntentClassification(INTENT_UNKNOWN, UNKNOWN_RESPONSE)

    return IntentClassification(INTENT_QUESTION)
