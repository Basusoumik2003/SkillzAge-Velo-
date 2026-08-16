from __future__ import annotations

import logging
import shutil
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import Settings, get_settings
from app.core.queue_exceptions import QueueDispatchException, QueueUnavailableException
from app.services.github_service import (
    GitHubAPIError,
    fetch_commit_metadata,
    fetch_repository_metadata,
    normalize_repository_url,
    parse_owner_repo,
)
from app.services.local_repo_service import (
    LocalRepositoryError,
    ensure_commit_checkout,
    fetch_commit_changed_files_from_checkout,
)

logger = logging.getLogger("internlabs-api.review.repository-loader")


@dataclass(slots=True)
class RepositoryWorkspace:
    repository_url: str
    normalized_repository_url: str
    branch_name: str
    commit_hash: str
    checkout_dir: str
    repository_root: str
    repository_metadata: dict[str, Any] = field(default_factory=dict)
    commit_metadata: dict[str, Any] = field(default_factory=dict)
    changed_files: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class RepositoryLoader:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    def load(
        self,
        *,
        repository_url: str,
        branch_name: str,
        commit_hash: str,
        cleanup: bool = False,
    ) -> RepositoryWorkspace:
        normalized_url = normalize_repository_url(repository_url)
        if not normalized_url:
            raise QueueDispatchException("Repository URL is missing.")

        try:
            checkout_dir = ensure_commit_checkout(self.settings, normalized_url, branch_name, commit_hash)
            repository_metadata = fetch_repository_metadata(self.settings, normalized_url)
            commit_metadata = fetch_commit_metadata(self.settings, normalized_url, commit_hash)
            changed_files = fetch_commit_changed_files_from_checkout(self.settings, normalized_url, branch_name, commit_hash)
        except (LocalRepositoryError, GitHubAPIError) as exc:
            logger.exception("Repository load failed")
            raise QueueUnavailableException(str(exc)) from exc

        workspace = RepositoryWorkspace(
            repository_url=repository_url,
            normalized_repository_url=normalized_url,
            branch_name=branch_name,
            commit_hash=commit_hash,
            checkout_dir=str(checkout_dir),
            repository_root=str(checkout_dir),
            repository_metadata=repository_metadata,
            commit_metadata=commit_metadata,
            changed_files=changed_files,
        )

        if cleanup:
            self.cleanup_workspace(workspace)

        return workspace

    def cleanup_workspace(self, workspace: RepositoryWorkspace) -> None:
        if not workspace.repository_root:
            return
        root = Path(workspace.repository_root)
        if not root.exists():
            return
        try:
            shutil.rmtree(root, ignore_errors=True)
        except Exception:
            logger.warning("Failed to clean up repository workspace: %s", root)

    def get_repository_metadata(self, repository_url: str) -> dict[str, Any]:
        normalized_url = normalize_repository_url(repository_url)
        if not normalized_url:
            return {}
        try:
            return fetch_repository_metadata(self.settings, normalized_url)
        except GitHubAPIError:
            return {}

    def get_commit_metadata(self, repository_url: str, commit_hash: str) -> dict[str, Any]:
        normalized_url = normalize_repository_url(repository_url)
        if not normalized_url:
            return {}
        try:
            return fetch_commit_metadata(self.settings, normalized_url, commit_hash)
        except GitHubAPIError:
            return {}

    def repository_identity(self, repository_url: str) -> tuple[str, str]:
        return parse_owner_repo(repository_url)
