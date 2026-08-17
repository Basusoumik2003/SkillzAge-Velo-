from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.services.repository_loader import RepositoryWorkspace

logger = logging.getLogger("internlabs-api.review.diff-builder")

IGNORED_FILE_PATTERNS = (
    r"(^|/)\.git/",
    r"(^|/)node_modules/",
    r"(^|/)dist/",
    r"(^|/)build/",
    r"(^|/)coverage/",
    r"(^|/)__pycache__/",
    r"\.min\.(js|css|map)$",
    r"\.lock$",
    r"\.png$",
    r"\.jpg$",
    r"\.jpeg$",
    r"\.gif$",
    r"\.webp$",
    r"\.pdf$",
    r"\.zip$",
    r"\.exe$",
    r"\.dll$",
)

GENERATED_FILE_PATTERNS = (
    r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$",
    r"(^|/)(requirements\.txt|poetry\.lock)$",
    r"(^|/).*\.generated\.",
    r"(^|/).*\.gen\.",
)


@dataclass(slots=True)
class DiffFunction:
    name: str
    file_path: str
    change_type: str
    hunk_header: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class DiffFile:
    filename: str
    status: str
    additions: int
    deletions: int
    changes: int
    patch: str
    functions: list[DiffFunction] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "status": self.status,
            "additions": self.additions,
            "deletions": self.deletions,
            "changes": self.changes,
            "patch": self.patch,
            "functions": [item.to_dict() for item in self.functions],
        }


@dataclass(slots=True)
class DiffBundle:
    commit_hash: str
    repository_url: str
    branch_name: str
    files: list[DiffFile]
    functions: list[DiffFunction]
    ignored_files: list[str] = field(default_factory=list)
    binary_files: list[str] = field(default_factory=list)
    generated_files: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "commit_hash": self.commit_hash,
            "repository_url": self.repository_url,
            "branch_name": self.branch_name,
            "files": [item.to_dict() for item in self.files],
            "functions": [item.to_dict() for item in self.functions],
            "ignored_files": self.ignored_files,
            "binary_files": self.binary_files,
            "generated_files": self.generated_files,
        }


class DiffBuilder:
    def __init__(self, max_patch_chars: int = 6000):
        self.max_patch_chars = max(1000, int(max_patch_chars))

    def build(self, workspace: RepositoryWorkspace) -> DiffBundle:
        files: list[DiffFile] = []
        functions: list[DiffFunction] = []
        ignored_files: list[str] = []
        binary_files: list[str] = []
        generated_files: list[str] = []

        for item in workspace.changed_files:
            filename = str(item.get("filename") or "").strip()
            if not filename:
                continue
            if self._should_ignore(filename):
                ignored_files.append(filename)
                continue
            if self._is_binary(item):
                binary_files.append(filename)
                continue
            if self._is_generated(filename):
                generated_files.append(filename)
                continue

            patch = str(item.get("patch") or "").strip()[: self.max_patch_chars]
            change_functions = self._extract_functions(filename, patch)
            diff_file = DiffFile(
                filename=filename,
                status=str(item.get("status") or "modified"),
                additions=int(item.get("additions") or 0),
                deletions=int(item.get("deletions") or 0),
                changes=int(item.get("changes") or 0),
                patch=patch,
                functions=change_functions,
            )
            files.append(diff_file)
            functions.extend(change_functions)

        return DiffBundle(
            commit_hash=workspace.commit_hash,
            repository_url=workspace.repository_url,
            branch_name=workspace.branch_name,
            files=files,
            functions=functions,
            ignored_files=ignored_files,
            binary_files=binary_files,
            generated_files=generated_files,
        )

    def _should_ignore(self, filename: str) -> bool:
        normalized = filename.replace("\\", "/")
        return any(re.search(pattern, normalized, flags=re.IGNORECASE) for pattern in IGNORED_FILE_PATTERNS)

    def _is_generated(self, filename: str) -> bool:
        normalized = filename.replace("\\", "/")
        return any(re.search(pattern, normalized, flags=re.IGNORECASE) for pattern in GENERATED_FILE_PATTERNS)

    def _is_binary(self, item: dict[str, Any]) -> bool:
        patch = str(item.get("patch") or "")
        status = str(item.get("status") or "").lower()
        if status == "binary":
            return True
        if not patch:
            additions = int(item.get("additions") or 0)
            deletions = int(item.get("deletions") or 0)
            return additions == 0 and deletions == 0 and int(item.get("changes") or 0) == 0
        return False

    def _extract_functions(self, filename: str, patch: str) -> list[DiffFunction]:
        functions: list[DiffFunction] = []
        if not patch:
            return functions

        current_hunk = ""
        for line in patch.splitlines():
            if line.startswith("@@"):
                current_hunk = line
                function_name = self._function_name_from_hunk(line) or self._function_name_from_patch_context(line)
                if function_name:
                    functions.append(
                        DiffFunction(
                            name=function_name,
                            file_path=filename,
                            change_type="hunk",
                            hunk_header=line,
                        )
                    )
                continue

            if line.startswith(("+", "-")):
                candidate = self._extract_symbol_from_line(line[1:].strip())
                if candidate:
                    functions.append(
                        DiffFunction(
                            name=candidate,
                            file_path=filename,
                            change_type="symbol",
                            hunk_header=current_hunk,
                        )
                    )

        deduped: list[DiffFunction] = []
        seen = set()
        for item in functions:
            key = (item.name, item.file_path)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped

    def _function_name_from_hunk(self, line: str) -> str:
        match = re.search(r"@@.*@@\s*(.*)$", line)
        if not match:
            return ""
        return self._extract_symbol_from_line(match.group(1))

    def _function_name_from_patch_context(self, line: str) -> str:
        return self._extract_symbol_from_line(line)

    def _extract_symbol_from_line(self, text: str) -> str:
        text = str(text or "").strip()
        if not text:
            return ""

        patterns = [
            r"^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)",
            r"^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)",
            r"^\s*async\s+def\s+([A-Za-z_][A-Za-z0-9_]*)",
            r"^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)",
            r"^\s*(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=",
            r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return ""

