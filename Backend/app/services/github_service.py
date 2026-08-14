import re
from typing import Any, Dict, List, Tuple
from urllib.parse import urlparse

import requests

from app.core.config import Settings


class GitHubAPIError(RuntimeError):
    def __init__(self, status_code: int, message: str, endpoint: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.endpoint = endpoint


def normalize_repository_url(raw_url: str) -> str:
    value = (raw_url or "").strip()
    if not value:
        return ""

    ssh_match = re.match(r"^git@github\.com:(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$", value)
    if ssh_match:
        owner = ssh_match.group("owner")
        repo = ssh_match.group("repo")
        return f"https://github.com/{owner}/{repo}"

    if value.endswith(".git"):
        value = value[:-4]
    value = value.rstrip("/")
    return value


def parse_owner_repo(repository_url: str) -> Tuple[str, str]:
    normalized = normalize_repository_url(repository_url)
    parsed = urlparse(normalized)
    if parsed.netloc.lower() != "github.com":
        raise ValueError("Only github.com repositories are supported")

    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        raise ValueError("Repository URL must include owner and repository name")

    return parts[0], parts[1]


def _headers(settings: Settings) -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _request_json(
    settings: Settings,
    endpoint: str,
    timeout: int,
    method: str = "GET",
    json_body: Any | None = None,
) -> Any:
    try:
        response = requests.request(
            method.upper(),
            endpoint,
            headers=_headers(settings),
            timeout=timeout,
            json=json_body,
        )
    except requests.exceptions.RequestException as exc:
        raise GitHubAPIError(
            503,
            f"Unable to reach GitHub API: {exc}",
            endpoint=endpoint,
        ) from exc

    if response.status_code >= 400:
        message = ""

        try:
            payload = response.json()
            message = payload.get("message", "")
            errors = payload.get("errors")

            if errors:
                message += f" | Errors: {errors}"

        except Exception:
            message = response.text.strip()

        if not message:
            message = f"GitHub API request failed ({response.status_code})"

        raise GitHubAPIError(
            response.status_code,
            message,
            endpoint=endpoint,
        )

    if not response.content:
        return {}

    return response.json()


def fetch_branch_head_commit(settings: Settings, repository_url: str, branch_name: str) -> str:
    owner, repo = parse_owner_repo(repository_url)
    endpoint = f"{settings.github_api_base.rstrip('/')}/repos/{owner}/{repo}/branches/{branch_name}"
    data = _request_json(settings, endpoint, timeout=15)
    if not isinstance(data, dict):
        raise GitHubAPIError(500, "GitHub API returned unexpected branch payload", endpoint=endpoint)
    return data.get("commit", {}).get("sha", "")


def fetch_commit_changed_files(settings: Settings, repository_url: str, commit_hash: str) -> List[Dict]:
    owner, repo = parse_owner_repo(repository_url)
    endpoint = f"{settings.github_api_base.rstrip('/')}/repos/{owner}/{repo}/commits/{commit_hash}"
    payload = _request_json(settings, endpoint, timeout=20)
    if not isinstance(payload, dict):
        raise GitHubAPIError(500, "GitHub API returned unexpected commit payload", endpoint=endpoint)
    files = payload.get("files", []) or []
    normalized_files = []
    for item in files:
        normalized_files.append(
            {
                "filename": item.get("filename", ""),
                "status": item.get("status", "modified"),
                "additions": item.get("additions", 0),
                "deletions": item.get("deletions", 0),
                "changes": item.get("changes", 0),
                "patch": (item.get("patch") or "")[:4000],
            }
        )
    return normalized_files


def fetch_repository_metadata(settings: Settings, repository_url: str) -> Dict[str, Any]:
    owner, repo = parse_owner_repo(repository_url)
    endpoint = f"{settings.github_api_base.rstrip('/')}/repos/{owner}/{repo}"
    payload = _request_json(settings, endpoint, timeout=15)
    if not isinstance(payload, dict):
        raise GitHubAPIError(500, "GitHub API returned unexpected repository payload", endpoint=endpoint)
    return {
        "full_name": payload.get("full_name", ""),
        "default_branch": payload.get("default_branch", "main") or "main",
        "private": bool(payload.get("private", False)),
        "archived": bool(payload.get("archived", False)),
        "disabled": bool(payload.get("disabled", False)),
        "html_url": payload.get("html_url", ""),
        "clone_url": payload.get("clone_url", ""),
        "ssh_url": payload.get("ssh_url", ""),
        "permissions": payload.get("permissions") or {},
        "visibility": payload.get("visibility", ""),
        "updated_at": payload.get("updated_at", ""),
    }


def fetch_commit_metadata(settings: Settings, repository_url: str, commit_hash: str) -> Dict[str, Any]:
    owner, repo = parse_owner_repo(repository_url)
    endpoint = f"{settings.github_api_base.rstrip('/')}/repos/{owner}/{repo}/commits/{commit_hash}"
    payload = _request_json(settings, endpoint, timeout=20)
    if not isinstance(payload, dict):
        raise GitHubAPIError(500, "GitHub API returned unexpected commit payload", endpoint=endpoint)
    commit = payload.get("commit") or {}
    parents = payload.get("parents") or []
    return {
        "sha": payload.get("sha", commit_hash),
        "html_url": payload.get("html_url", ""),
        "commit_message": commit.get("message", ""),
        "author_name": (commit.get("author") or {}).get("name", ""),
        "author_email": (commit.get("author") or {}).get("email", ""),
        "committer_name": (commit.get("committer") or {}).get("name", ""),
        "committer_email": (commit.get("committer") or {}).get("email", ""),
        "committed_at": (commit.get("committer") or {}).get("date", ""),
        "parent_shas": [parent.get("sha", "") for parent in parents if parent.get("sha")],
        "stats": payload.get("stats") or {},
        "files": payload.get("files") or [],
        "raw": payload,
    }


def create_or_update_repository_webhook(
    settings: Settings,
    repository_url: str,
    *,
    callback_url: str,
    webhook_secret: str = "",
    active: bool = True,
) -> Dict[str, Any]:
    owner, repo = parse_owner_repo(repository_url)
    hooks_endpoint = f"{settings.github_api_base.rstrip('/')}/repos/{owner}/{repo}/hooks"
    desired_url = str(callback_url or "").rstrip("/")
    payload = {
        "config": {
            "url": callback_url,
            "content_type": "json",
        },
        "events": ["push"],
        "active": bool(active),
    }
    if webhook_secret:
        payload["config"]["secret"] = webhook_secret

    hooks = _request_json(settings, hooks_endpoint, timeout=20)
    if not isinstance(hooks, list):
        raise GitHubAPIError(500, "GitHub API returned unexpected webhook list payload", endpoint=hooks_endpoint)

    for hook in hooks:
        if not isinstance(hook, dict):
            continue
        config = hook.get("config") or {}
        existing_url = str(config.get("url") or "").rstrip("/")
        if existing_url and existing_url == desired_url:
            hook_id = hook.get("id")
            if not hook_id:
                break
            endpoint = f"{hooks_endpoint}/{hook_id}"
            updated = _request_json(settings, endpoint, timeout=20, method="PATCH", json_body=payload)
            return {
                "action": "updated",
                "hook": updated if isinstance(updated, dict) else {},
            }

    created = _request_json(settings, hooks_endpoint, timeout=20, method="POST", json_body=payload)
    return {
        "action": "created",
        "hook": created if isinstance(created, dict) else {},
    }


def is_repository_webhook_active(
    settings: Settings,
    repository_url: str,
    *,
    callback_url: str,
) -> bool:
    owner, repo = parse_owner_repo(repository_url)
    hooks_endpoint = f"{settings.github_api_base.rstrip('/')}/repos/{owner}/{repo}/hooks"
    desired_url = str(callback_url or "").rstrip("/")
    desired_path = urlparse(desired_url).path.rstrip("/")
    hooks = _request_json(settings, hooks_endpoint, timeout=20)
    if not isinstance(hooks, list):
        raise GitHubAPIError(500, "GitHub API returned unexpected webhook list payload", endpoint=hooks_endpoint)

    for hook in hooks:
        if not isinstance(hook, dict):
            continue
        config = hook.get("config") or {}
        existing_url = str(config.get("url") or "").rstrip("/")
        existing_path = urlparse(existing_url).path.rstrip("/")
        if bool(hook.get("active", False)) and (
            (existing_url and existing_url == desired_url)
            or (existing_path and desired_path and existing_path == desired_path)
            or existing_path.endswith("/github/webhook")
            or existing_path.endswith("/api/github/webhook")
        ):
            return True
    return False
