"""RAG retrieval for the startup-journey mentor chat.

Schema (see Backend/sql/migrations/2026-08-13_01_startup_journey_schema.sql,
2026-08-14_01_knowledge_sources_storage_columns.sql and
2026-08-15_01_rag_embeddings.sql):

  - `knowledge_sources` / `knowledge_chunks` - the general RAG store, scoped
    via `knowledge_sources.source_scope` in {global, phase, stage, idea, user}.
    `knowledge_chunks.embedding` is a plain `DOUBLE PRECISION[]` column
    (Approach A - no external vector store, no pgvector extension needed).
  - `stage_documents` / `stage_document_chunks` - documents attached directly
    to a phase/stage (uploaded reference material, prompts, templates, etc.),
    embedded the same way.

`retrieve_agent_context(...)` is the only function app/routes/chat.py calls
directly; its signature is intentionally unchanged from the legacy
(pre-startup) rag_service.py so the call site in chat.py did not need to be
rewritten - it just gained three new optional kwargs (`step_number`,
`stage_index`, `stage_key`) so retrieval can be stage-aware.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import re
from collections import Counter
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.ai_usage_service import record_ai_usage_event
from app.services.stage_document_review import fetch_document_text

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_DIMENSION = 1536
DEFAULT_CHUNK_CHARS = 1800
DEFAULT_CHUNK_OVERLAP = 250
MAX_RETRIEVAL_CHUNKS = 8
MAX_CONTEXT_CHARS = 9000
INDEX_SCHEMA_VERSION = 1

ACRONYM_SYNONYMS = {
    "brd": "business requirements document",
    "business requirements document": "BRD",
    "mvp": "minimum viable product",
    "minimum viable product": "MVP",
    "gtm": "go to market",
    "go to market": "GTM",
    "kpi": "key performance indicator",
    "key performance indicator": "KPI",
    "okr": "objectives and key results",
    "objectives and key results": "OKR",
    "faq": "frequently asked questions",
    "frequently asked questions": "FAQ",
    "api": "application programming interface",
    "application programming interface": "API",
    "rag": "retrieval augmented generation",
    "retrieval augmented generation": "RAG",
}
STOPWORDS = {
    "about", "above", "after", "again", "against", "also", "and", "any", "are", "because", "been",
    "before", "being", "between", "both", "but", "can", "could", "did", "does", "done", "each",
    "from", "for", "had", "has", "have", "having", "here", "how", "into", "its", "may", "more",
    "most", "not", "now", "off", "only", "our", "out", "over", "own", "same", "should", "such",
    "than", "that", "the", "their", "then", "there", "these", "they", "this", "those", "through",
    "under", "using", "very", "was", "were", "what", "when", "where", "which", "while", "who",
    "will", "with", "within", "without", "would", "you", "your",
}


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _clean_index_text(value: str) -> str:
    text_value = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    text_value = re.sub(r"[ \t]+", " ", text_value)
    text_value = re.sub(r"\n{3,}", "\n\n", text_value)
    return text_value.strip()


def _words(value: str, *, min_length: int = 3) -> list[str]:
    return re.findall(rf"[a-zA-Z0-9_]{{{min_length},}}", str(value or "").lower())


def _summarize_text(value: str, *, limit: int = 420) -> str:
    text_value = _normalize_space(value)
    if len(text_value) <= limit:
        return text_value
    sentences = re.split(r"(?<=[.!?])\s+", text_value)
    summary = ""
    for sentence in sentences:
        candidate = f"{summary} {sentence}".strip()
        if len(candidate) > limit:
            break
        summary = candidate
    return summary or text_value[:limit].rsplit(" ", 1)[0].strip()


def _extract_keywords(*values: str, limit: int = 18) -> list[str]:
    counter: Counter[str] = Counter()
    for value in values:
        for word in _words(value):
            if word not in STOPWORDS and not word.isdigit():
                counter[word] += 1
    return [word for word, _count in counter.most_common(limit)]


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _split_body(text_value: str, *, max_chars: int, overlap: int) -> list[str]:
    if len(text_value) <= max_chars:
        return [text_value] if text_value else []
    bodies: list[str] = []
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text_value) if part.strip()]
    current = ""
    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current:
                bodies.append(current.strip())
                current = ""
            start = 0
            while start < len(paragraph):
                bodies.append(paragraph[start:start + max_chars].strip())
                start += max(1, max_chars - overlap)
            continue
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                bodies.append(current.strip())
            current = paragraph
    if current:
        bodies.append(current.strip())
    return [body for body in bodies if body]


def build_index_chunks(
    text_value: str,
    *,
    document_title: str = "",
    document_type: str = "reference",
    source_scope: str = "global",
    max_chars: int = DEFAULT_CHUNK_CHARS,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[dict[str, Any]]:
    """Splits raw document text into overlapping chunks and attaches light
    keyword metadata used for the lexical-boost part of ranking."""
    clean_text = _clean_index_text(text_value)
    if not clean_text:
        return []
    document_keywords = _extract_keywords(document_title, document_type, clean_text, limit=24)
    bodies = _split_body(clean_text, max_chars=max_chars, overlap=overlap)
    chunks: list[dict[str, Any]] = []
    for chunk_index, body in enumerate(bodies):
        keywords = _extract_keywords(document_title, body, limit=16)
        metadata = {
            "schema_version": INDEX_SCHEMA_VERSION,
            "document_title": document_title,
            "document_type": document_type or "reference",
            "source_scope": source_scope,
            "keywords": keywords,
            "document_keywords": document_keywords,
            "summary": _summarize_text(body, limit=300),
            "char_count": len(body),
            "token_count_estimate": max(1, len(body.split())),
        }
        chunks.append({"content": body, "metadata": metadata})
    return chunks


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

def _hash_embedding(text_value: str, dimension: int = DEFAULT_EMBEDDING_DIMENSION) -> list[float]:
    vector = [0.0] * dimension
    words = re.findall(r"[a-zA-Z0-9_]+", str(text_value or "").lower())
    for word in words:
        digest = hashlib.sha256(word.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimension
        sign = -1.0 if digest[4] % 2 else 1.0
        vector[index] += sign
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [round(value / norm, 8) for value in vector]


def embed_texts(texts: list[str], *, user_id=None, project_name: str = "") -> tuple[list[list[float]], str]:
    settings = get_settings()
    if settings.openai_api_key:
        try:
            from langchain_openai import OpenAIEmbeddings

            embeddings = OpenAIEmbeddings(model=settings.openai_embedding_model, api_key=settings.openai_api_key)
            vectors = embeddings.embed_documents(texts)
            total_chars = sum(len(t) for t in texts)
            estimated_tokens = max(1, total_chars // 4)
            record_ai_usage_event(
                provider="openai",
                model=settings.openai_embedding_model,
                feature="rag_embedding",
                route="backend.app.services.rag_service.embed_texts",
                user_id=user_id,
                project_name=project_name,
                usage={
                    "prompt_tokens": estimated_tokens,
                    "completion_tokens": 0,
                    "total_tokens": estimated_tokens,
                    "input_tokens": estimated_tokens,
                    "output_tokens": 0,
                    "text_count": len(texts),
                    "total_chars": total_chars,
                    "estimated": True,
                },
            )
            return vectors, settings.openai_embedding_model
        except Exception:
            logger.exception("OpenAI embedding generation failed; falling back to deterministic local embeddings.")

    return [_hash_embedding(item) for item in texts], "local-hash-embedding"


def embed_query(query: str) -> tuple[list[float], str]:
    vectors, model = embed_texts([query])
    return (vectors[0] if vectors else _hash_embedding(query), model)


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    length = min(len(left), len(right))
    dot = sum(float(left[i]) * float(right[i]) for i in range(length))
    left_norm = math.sqrt(sum(float(value) * float(value) for value in left[:length])) or 1.0
    right_norm = math.sqrt(sum(float(value) * float(value) for value in right[:length])) or 1.0
    return dot / (left_norm * right_norm)


def _metadata_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError, ValueError):
            return {}
    return {}


def _metadata_boost(query_terms: set[str], metadata: dict[str, Any], title: str = "") -> float:
    if not query_terms:
        return 0.0
    boost = 0.0
    weighted_fields = [
        (str(title or metadata.get("document_title") or ""), 0.18),
        (" ".join(str(item) for item in (metadata.get("keywords") or []) if item), 0.22),
        (" ".join(str(item) for item in (metadata.get("document_keywords") or []) if item), 0.12),
    ]
    for value, weight in weighted_fields:
        terms = set(_words(value))
        if terms:
            boost += weight * (len(query_terms.intersection(terms)) / max(1, len(query_terms)))
    return boost


def _document_text(row: dict[str, Any]) -> str:
    raw_text = str(row.get("content_text") or "").strip()
    if raw_text:
        return raw_text
    storage_url = str(row.get("storage_url") or "").strip()
    original_filename = str(row.get("original_filename") or row.get("title") or "").strip()
    if storage_url:
        return fetch_document_text(storage_url, original_filename)
    return ""


# ---------------------------------------------------------------------------
# Indexing - writes chunks + embeddings for one knowledge_sources row or one
# stage_documents row. Not called by chat.py directly; this is the ingestion
# path an admin "index this document" action should call after a
# knowledge_sources/stage_documents row is created.
# ---------------------------------------------------------------------------

def index_knowledge_source(db: Session, source_id: int) -> dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT id, phase_id, stage_id, idea_id, user_id, source_scope, title,
                   content_text, storage_url, original_filename
            FROM knowledge_sources
            WHERE id = :source_id AND is_active = TRUE
            """
        ),
        {"source_id": source_id},
    ).mappings().first()
    if not row:
        return {"source_id": source_id, "status": "not_found", "chunk_count": 0}

    row = dict(row)
    document_text = _document_text(row)
    if not document_text.strip():
        return {"source_id": source_id, "status": "empty_text", "chunk_count": 0}

    chunks = build_index_chunks(
        document_text,
        document_title=str(row.get("title") or ""),
        document_type="reference",
        source_scope=str(row.get("source_scope") or "global"),
    )
    if not chunks:
        return {"source_id": source_id, "status": "no_chunks", "chunk_count": 0}

    db.execute(text("DELETE FROM knowledge_chunks WHERE source_id = :source_id"), {"source_id": source_id})

    embeddings, embedding_model = embed_texts([c["content"] for c in chunks])
    for index, chunk in enumerate(chunks):
        embedding = embeddings[index] if index < len(embeddings) else []
        db.execute(
            text(
                """
                INSERT INTO knowledge_chunks
                  (source_id, chunk_index, chunk_text, token_count, embedding_model,
                   embedding, embedding_dimension, metadata, created_at)
                VALUES
                  (:source_id, :chunk_index, :chunk_text, :token_count, :embedding_model,
                   :embedding, :embedding_dimension, CAST(:metadata AS JSONB), NOW())
                """
            ),
            {
                "source_id": source_id,
                "chunk_index": index,
                "chunk_text": chunk["content"],
                "token_count": chunk["metadata"].get("token_count_estimate") or 0,
                "embedding_model": embedding_model,
                "embedding": embedding,
                "embedding_dimension": len(embedding),
                "metadata": json.dumps(chunk["metadata"], ensure_ascii=False, default=str),
            },
        )
    db.execute(text("UPDATE knowledge_sources SET indexed_at = NOW() WHERE id = :source_id"), {"source_id": source_id})
    db.commit()
    return {"source_id": source_id, "status": "indexed", "chunk_count": len(chunks), "embedding_model": embedding_model}


def index_stage_document(db: Session, stage_document_id: int) -> dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT id, phase_id, stage_id, title, document_type, content_text, storage_url, original_filename
            FROM stage_documents
            WHERE id = :stage_document_id AND is_active = TRUE
            """
        ),
        {"stage_document_id": stage_document_id},
    ).mappings().first()
    if not row:
        return {"stage_document_id": stage_document_id, "status": "not_found", "chunk_count": 0}

    row = dict(row)
    document_text = _document_text(row)
    if not document_text.strip():
        return {"stage_document_id": stage_document_id, "status": "empty_text", "chunk_count": 0}

    chunks = build_index_chunks(
        document_text,
        document_title=str(row.get("title") or ""),
        document_type=str(row.get("document_type") or "reference"),
        source_scope="stage",
    )
    if not chunks:
        return {"stage_document_id": stage_document_id, "status": "no_chunks", "chunk_count": 0}

    db.execute(
        text("DELETE FROM stage_document_chunks WHERE stage_document_id = :stage_document_id"),
        {"stage_document_id": stage_document_id},
    )

    embeddings, embedding_model = embed_texts([c["content"] for c in chunks])
    for index, chunk in enumerate(chunks):
        embedding = embeddings[index] if index < len(embeddings) else []
        db.execute(
            text(
                """
                INSERT INTO stage_document_chunks
                  (stage_document_id, chunk_index, chunk_text, token_count, embedding_model,
                   embedding, embedding_dimension, metadata, created_at)
                VALUES
                  (:stage_document_id, :chunk_index, :chunk_text, :token_count, :embedding_model,
                   :embedding, :embedding_dimension, CAST(:metadata AS JSONB), NOW())
                """
            ),
            {
                "stage_document_id": stage_document_id,
                "chunk_index": index,
                "chunk_text": chunk["content"],
                "token_count": chunk["metadata"].get("token_count_estimate") or 0,
                "embedding_model": embedding_model,
                "embedding": embedding,
                "embedding_dimension": len(embedding),
                "metadata": json.dumps(chunk["metadata"], ensure_ascii=False, default=str),
            },
        )
    db.execute(text("UPDATE stage_documents SET indexed_at = NOW() WHERE id = :stage_document_id"), {"stage_document_id": stage_document_id})
    db.commit()
    return {"stage_document_id": stage_document_id, "status": "indexed", "chunk_count": len(chunks), "embedding_model": embedding_model}


def index_pending_knowledge_sources(db: Session, *, limit: int = 50) -> list[dict[str, Any]]:
    rows = db.execute(
        text("SELECT id FROM knowledge_sources WHERE is_active = TRUE AND indexed_at IS NULL ORDER BY id ASC LIMIT :limit"),
        {"limit": limit},
    ).all()
    return [index_knowledge_source(db, row[0]) for row in rows]


def index_pending_stage_documents(db: Session, *, limit: int = 50) -> list[dict[str, Any]]:
    rows = db.execute(
        text("SELECT id FROM stage_documents WHERE is_active = TRUE AND indexed_at IS NULL ORDER BY id ASC LIMIT :limit"),
        {"limit": limit},
    ).all()
    return [index_stage_document(db, row[0]) for row in rows]


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def _resolve_stage_scope(
    db: Session,
    *,
    step_number: int | None,
    stage_index: int | None,
    stage_key: str | None,
) -> tuple[int | None, int | None]:
    """Returns (phase_id, stage_id) for the active stage, if resolvable."""
    if stage_key:
        row = db.execute(
            text(
                """
                SELECT js.id AS stage_id, js.phase_id AS phase_id
                FROM journey_stages js
                WHERE LOWER(TRIM(js.stage_key)) = LOWER(TRIM(:stage_key))
                LIMIT 1
                """
            ),
            {"stage_key": stage_key},
        ).mappings().first()
        if row:
            return int(row["phase_id"]), int(row["stage_id"])

    if step_number is not None and stage_index is not None:
        row = db.execute(
            text(
                """
                SELECT js.id AS stage_id, jp.id AS phase_id
                FROM journey_phases jp
                INNER JOIN journey_stages js ON js.phase_id = jp.id
                WHERE jp.phase_order = :phase_order AND js.stage_order = :stage_order
                LIMIT 1
                """
            ),
            {"phase_order": step_number, "stage_order": int(stage_index) + 1},
        ).mappings().first()
        if row:
            return int(row["phase_id"]), int(row["stage_id"])

    if step_number is not None:
        row = db.execute(
            text("SELECT id AS phase_id FROM journey_phases WHERE phase_order = :phase_order LIMIT 1"),
            {"phase_order": step_number},
        ).mappings().first()
        if row:
            return int(row["phase_id"]), None

    return None, None


def _fetch_knowledge_chunk_candidates(
    db: Session,
    *,
    phase_id: int | None,
    stage_id: int | None,
    idea_id,
    user_id,
    lexical_only: bool,
) -> list[dict[str, Any]]:
    embedding_filter = "" if lexical_only else "AND kc.embedding IS NOT NULL"
    rows = db.execute(
        text(
            f"""
            SELECT kc.id, kc.chunk_index, kc.chunk_text AS content, kc.embedding, kc.metadata AS document_metadata,
                   ks.title, ks.source_scope, 'reference' AS document_type
            FROM knowledge_chunks kc
            INNER JOIN knowledge_sources ks ON ks.id = kc.source_id
            WHERE ks.is_active = TRUE
              {embedding_filter}
              AND (
                    ks.source_scope = 'global'
                    OR (ks.source_scope = 'phase' AND ks.phase_id = :phase_id)
                    OR (ks.source_scope = 'stage' AND ks.stage_id = :stage_id)
                    OR (ks.source_scope = 'idea' AND ks.idea_id = :idea_id)
                    OR (ks.source_scope = 'user' AND ks.user_id = :user_id)
                  )
            """
        ),
        {"phase_id": phase_id, "stage_id": stage_id, "idea_id": idea_id, "user_id": user_id},
    ).mappings().all()
    return [dict(row) for row in rows]


def _fetch_stage_document_chunk_candidates(
    db: Session,
    *,
    phase_id: int | None,
    stage_id: int | None,
    lexical_only: bool,
) -> list[dict[str, Any]]:
    if not phase_id and not stage_id:
        return []
    embedding_filter = "" if lexical_only else "AND sdc.embedding IS NOT NULL"
    rows = db.execute(
        text(
            f"""
            SELECT sdc.id, sdc.chunk_index, sdc.chunk_text AS content, sdc.embedding, sdc.metadata AS document_metadata,
                   sd.title, 'stage' AS source_scope, sd.document_type
            FROM stage_document_chunks sdc
            INNER JOIN stage_documents sd ON sd.id = sdc.stage_document_id
            WHERE sd.is_active = TRUE
              {embedding_filter}
              AND ((:stage_id IS NOT NULL AND sd.stage_id = :stage_id) OR (:phase_id IS NOT NULL AND sd.phase_id = :phase_id AND sd.stage_id IS NULL))
            """
        ),
        {"phase_id": phase_id, "stage_id": stage_id},
    ).mappings().all()
    return [dict(row) for row in rows]


def retrieve_agent_context(
    db: Session,
    *,
    project_name: str,
    mentor_id: int | None = None,
    backend_agent_key: str = "",
    question: str,
    max_chunks: int | None = None,
    max_context_chars: int | None = None,
    min_relevance_score: float | None = None,
    lexical_only: bool = False,
    include_global_documents: bool = True,
    include_company_documents: bool = True,
    step_number: int | None = None,
    stage_index: int | None = None,
    stage_key: str | None = None,
    user_id=None,
) -> dict[str, Any]:
    """Retrieves the most relevant knowledge/stage-document chunks for the
    student's current question, scoped to the active journey stage.

    `mentor_id`, `backend_agent_key`, and `include_company_documents` are
    accepted for call-signature compatibility with the pre-startup version
    of this function; they are not used for scoping here (startup content is
    scoped by phase/stage/idea/user, not by mentor/company).
    """
    del mentor_id, backend_agent_key, include_company_documents  # unused in the startup schema

    max_chunks = max_chunks or MAX_RETRIEVAL_CHUNKS
    max_context_chars = max_context_chars or MAX_CONTEXT_CHARS
    min_relevance_score = 0.0 if min_relevance_score is None else min_relevance_score

    phase_id, stage_id = _resolve_stage_scope(db, step_number=step_number, stage_index=stage_index, stage_key=stage_key)

    idea_row = None
    if user_id:
        idea_row = db.execute(
            text(
                """
                SELECT id FROM startup_ideas
                WHERE user_id = :user_id AND is_active = TRUE
                ORDER BY is_primary DESC, updated_at DESC
                LIMIT 1
                """
            ),
            {"user_id": user_id},
        ).mappings().first()
    idea_id = idea_row["id"] if idea_row else None

    candidates = _fetch_knowledge_chunk_candidates(
        db, phase_id=phase_id, stage_id=stage_id, idea_id=idea_id, user_id=user_id, lexical_only=lexical_only
    )
    if include_global_documents or phase_id or stage_id:
        candidates.extend(
            _fetch_stage_document_chunk_candidates(db, phase_id=phase_id, stage_id=stage_id, lexical_only=lexical_only)
        )

    if not candidates:
        return {"chunks": [], "documents": [], "context_text": ""}

    query_lower = str(question or "").lower()
    query_terms = {term for term in _words(question) if term not in STOPWORDS}
    for key, replacement in ACRONYM_SYNONYMS.items():
        if key in query_lower or replacement.lower() in query_lower:
            query_terms.update(_words(f"{key} {replacement}"))

    if lexical_only:
        query_embedding, _model = [], ""
    else:
        query_embedding, _model = embed_query(question)

    scored: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
    for row in candidates:
        metadata = _metadata_dict(row.get("document_metadata"))
        content = str(row.get("content") or "")
        if lexical_only:
            content_terms = set(_words(content))
            base_score = (len(query_terms.intersection(content_terms)) / max(1, len(query_terms))) if query_terms else 0.0
        else:
            base_score = _cosine_similarity(query_embedding, list(row.get("embedding") or []))
        score = base_score + _metadata_boost(query_terms, metadata, str(row.get("title") or ""))
        scored.append((score, row, metadata))

    scored.sort(key=lambda item: item[0], reverse=True)

    selected: list[dict[str, Any]] = []
    used_chars = 0
    documents_seen: dict[tuple[str, str], dict[str, Any]] = {}
    for score, row, metadata in scored:
        if len(selected) >= max_chunks:
            break
        if score < min_relevance_score:
            continue
        content = str(row.get("content") or "")
        if used_chars + len(content) > max_context_chars and selected:
            continue
        used_chars += len(content)
        item = {
            "score": round(float(score), 4),
            "chunk_id": row.get("id"),
            "chunk_index": row.get("chunk_index"),
            "document_title": row.get("title"),
            "document_type": row.get("document_type"),
            "source_scope": row.get("source_scope"),
            "global_category": "",
            "content": content,
        }
        if metadata.get("section"):
            item["section"] = metadata.get("section")
        selected.append(item)
        doc_key = (str(row.get("source_scope") or ""), str(row.get("title") or ""))
        documents_seen.setdefault(doc_key, {"title": row.get("title"), "source_scope": row.get("source_scope")})

    context_text = "\n\n---\n\n".join(
        f"[{idx}. {item['document_title']} / {item['document_type']} / {item['source_scope']}]\n{item['content']}"
        for idx, item in enumerate(selected, start=1)
    )

    return {
        "chunks": selected,
        "documents": list(documents_seen.values()),
        "context_text": context_text,
    }
