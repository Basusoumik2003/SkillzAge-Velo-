"""AI-generated-content detection for stage document submissions.

⚠️ PLACEHOLDER IMPLEMENTATION — this module was missing from the repo
entirely (no real detector was ever committed here). What ships below is a
safe, always-non-blocking stub: it never flags a submission and always
returns a low/zero probability, so `stage_document_review.py` (which
imports this module) can run without crashing. It is NOT a real AI-content
detector and must not be relied on for actual grading decisions.

To wire in a real detector (GPTZero, Originality.ai, Copyleaks, or a
custom classifier), replace the body of `detect()` below with a call to
that provider and keep the `DetectionResult` shape the same, since
`stage_document_review.py` reads `.to_dict()` and expects these keys:
ai_probability, confidence, status, warning_message, reasons,
raw_detector_response.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class DetectionResult:
    ai_probability: float = 0.0
    confidence: float = 0.0
    status: str = "not_evaluated"
    warning_message: str = ""
    reasons: list[str] = field(default_factory=list)
    raw_detector_response: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "ai_probability": self.ai_probability,
            "confidence": self.confidence,
            "status": self.status,
            "warning_message": self.warning_message,
            "reasons": self.reasons,
            "raw_detector_response": self.raw_detector_response,
        }


async def detect(
    document_text: str,
    *,
    user_id: int = 0,
    project_id: int = 0,
    stage_id: int = 0,
) -> DetectionResult:
    """Placeholder detector — always returns a neutral, non-blocking result.
    See the module docstring for how to replace this with a real provider."""
    text_value = str(document_text or "")
    if not text_value.strip():
        return DetectionResult(status="empty_document")

    return DetectionResult(
        ai_probability=0.0,
        confidence=0.0,
        status="not_evaluated",
        warning_message="",
        reasons=[],
        raw_detector_response={
            "provider": "none",
            "note": "ai_content_detection_service is a placeholder; no real detector is configured.",
            "user_id": user_id,
            "project_id": project_id,
            "stage_id": stage_id,
            "document_chars": len(text_value),
        },
    )
