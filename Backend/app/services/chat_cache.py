import json
from functools import lru_cache
from typing import Any

from app.core.config import get_settings

try:
    import redis
except Exception:
    redis = None


def _safe_project_key(project_name: str) -> str:
    return str(project_name or "").strip().lower().replace(" ", "_")[:180]


def chat_history_cache_key(user_id: int, project_name: str) -> str:
    return f"chat_history:{user_id}:{_safe_project_key(project_name)}"


@lru_cache
def get_redis_client():
    settings = get_settings()
    if not settings.redis_url or redis is None:
        return None
    try:
        client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def get_cached_history(user_id: int, project_name: str) -> list[dict[str, Any]] | None:
    client = get_redis_client()
    if client is None:
        return None
    try:
        raw = client.get(chat_history_cache_key(user_id, project_name))
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, list) or not parsed:
            return None
        return parsed
    except Exception:
        return None


def set_cached_history(user_id: int, project_name: str, messages: list[dict[str, Any]]) -> None:
    client = get_redis_client()
    if client is None:
        return
    settings = get_settings()
    limit = max(1, int(settings.chat_history_cache_limit or 100))
    ttl = max(30, int(settings.chat_history_cache_ttl_seconds or 900))
    try:
        client.setex(
            chat_history_cache_key(user_id, project_name),
            ttl,
            json.dumps(messages[-limit:], ensure_ascii=True),
        )
    except Exception:
        return


def append_cached_messages(user_id: int, project_name: str, new_messages: list[dict[str, Any]]) -> None:
    cached = get_cached_history(user_id, project_name)
    if cached is None:
        set_cached_history(user_id, project_name, new_messages)
        return
    set_cached_history(user_id, project_name, [*cached, *new_messages])
