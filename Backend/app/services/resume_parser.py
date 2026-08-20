"""Minimal resume text extraction, used only by the legacy `/project/resume`
upload endpoint (not part of the startup journey - student_profiles has no
resume field). Handles PDF (via PyPDF2, already a project dependency) and
falls back to a plain-text decode for anything else (.txt, .md, etc.)."""

from __future__ import annotations

import io
import logging
import re

logger = logging.getLogger(__name__)

try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def extract_resume_text(file_bytes: bytes, *, max_chars: int = 20000) -> str:
    if not file_bytes:
        return ""

    if file_bytes[:5] == b"%PDF-" and PdfReader is not None:
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            return _normalize(text)[:max_chars]
        except Exception:
            logger.exception("resume_parser: failed to extract text from PDF resume.")
            return ""

    try:
        return _normalize(file_bytes.decode("utf-8", errors="ignore"))[:max_chars]
    except Exception:
        return ""
