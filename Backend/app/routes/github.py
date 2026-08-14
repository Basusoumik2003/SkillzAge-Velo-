import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.database import get_db
from app.db.github_models import CodeReview, GitHubRepository
from app.db.models import User
from app.routes.auth import get_current_user
from app.services.stage_resolver import resolve_stage_event
from app.services.github_service import (
    GitHubAPIError,
    create_or_update_repository_webhook,
    is_repository_webhook_active,
    normalize_repository_url,
    parse_owner_repo,
)
from app.services.github_settings_service import get_effective_github_settings
from app.services.webhook_handler import is_valid_github_signature, process_push_webhook

router = APIRouter(prefix="/github", tags=["github"])
webhook_router = APIRouter(prefix="/api/github", tags=["github"])
settings = get_settings()
logger = logging.getLogger("internlabs-api.github")


class ConnectGitHubInput(BaseModel):
    github_username: str = Field(min_length=1, max_length=120)
    repository_url: str = Field(min_length=10, max_length=255)
    project_name: str = Field(min_length=1, max_length=160)
    branch_name: str = Field(default="main", min_length=1, max_length=120)


class StageEventInput(BaseModel):
    user_id: int | None = None
    project_name: str
    step_number: int = Field(ge=1)
    stage_index: int = Field(ge=0)
    event_type: str | None = Field(default="stage_entered")
    actor: str = Field(default="system")
    previous_status: str | None = None
    current_status: str | None = None
    source_payload: dict | None = None


def _serialize_review(row: CodeReview) -> dict:
    try:
        files = json.loads(row.changed_files or "[]")
    except json.JSONDecodeError:
        files = []
    try:
        review_payload = json.loads(row.review_feedback or "{}")
    except json.JSONDecodeError:
        review_payload = {
            "safe_student_feedback": row.review_feedback,
            "score": None,
            "status": None,
            "insight_level": None,
            "missing_items": [],
            "weak_areas": [],
            "strengths": [],
        }

    return {
        "id": row.id,
        "project_name": row.project_name,
        "commit_hash": row.commit_hash,
        "changed_files": files,
        "review_feedback": review_payload.get("safe_student_feedback", row.review_feedback),
        "review_summary": review_payload,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _serialize_repository(repo: GitHubRepository | None, latest_review: CodeReview | None = None) -> dict | None:
    if not repo:
        return None

    if latest_review:
        last_sync = f"Reviewed at {latest_review.created_at.isoformat()}"
        reviewed_commit = latest_review.commit_hash
    elif repo.last_commit_hash:
        last_sync = "Latest commit tracked. Waiting for review details."
        reviewed_commit = repo.last_reviewed_commit or None
    else:
        last_sync = "Connected. No sync yet."
        reviewed_commit = repo.last_reviewed_commit or None

    return {
        "id": repo.id,
        "github_username": repo.github_username,
        "project_name": repo.project_name,
        "repository_url": repo.repository_url,
        "branch_name": repo.branch_name,
        "webhook_id": getattr(repo, "webhook_id", None),
        "last_commit_hash": repo.last_commit_hash,
        "webhook_enabled": bool(getattr(repo, "webhook_enabled", False)),
        "connection_status": str(getattr(repo, "connection_status", "") or ""),
        "connected_at": repo.connected_at.isoformat() if repo.connected_at else None,
        "last_reviewed_commit": reviewed_commit,
        "last_sync_status": last_sync,
    }


@router.post("/connect")
def connect_repository(
    payload: ConnectGitHubInput,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    normalized_url = normalize_repository_url(payload.repository_url)
    normalized_project_name = str(payload.project_name or "").strip()
    if not normalized_project_name:
        raise HTTPException(status_code=400, detail="project_name is required.")
    try:
        parse_owner_repo(normalized_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    github_settings = get_effective_github_settings(db, settings)

    repository = (
        db.query(GitHubRepository)
        .filter(
            GitHubRepository.user_id == user.id,
            GitHubRepository.project_name.ilike(normalized_project_name),
        )
        .first()
    )
    if not repository:
        legacy_repository = (
            db.query(GitHubRepository)
            .filter(
                GitHubRepository.user_id == user.id,
                (GitHubRepository.project_name.is_(None)) | (GitHubRepository.project_name == ""),
            )
            .first()
        )
        if legacy_repository:
            repository = legacy_repository
    if not repository:
        repository = GitHubRepository(
            user_id=user.id,
            project_name=normalized_project_name,
            github_username=payload.github_username.strip(),
            repository_url=normalized_url,
            branch_name=payload.branch_name.strip() or "main",
            default_branch=payload.branch_name.strip() or "main",
            connection_status="connected",
            connected_at=datetime.now(timezone.utc),
        )
    else:
        repository.project_name = normalized_project_name
        repository.github_username = payload.github_username.strip()
        repository.repository_url = normalized_url
        repository.branch_name = payload.branch_name.strip() or "main"
        repository.default_branch = payload.branch_name.strip() or "main"
        repository.connection_status = "connected"
        repository.connection_verified_at = datetime.now(timezone.utc)

    db.add(repository)
    db.commit()
    db.refresh(repository)

    webhook_status = {"status": "not_configured", "enabled": False}
    if github_settings.github_token:
        callback_url = str(getattr(github_settings, "github_webhook_url", "") or request.url_for("github_webhook")).strip()
        try:
            webhook_result = create_or_update_repository_webhook(
                github_settings,
                normalized_url,
                callback_url=callback_url,
                webhook_secret=str(getattr(github_settings, "github_webhook_secret", "") or "").strip(),
                active=True,
            )
            hook = webhook_result.get("hook") or {}
            hook_id = hook.get("id")
            repository.webhook_id = int(hook_id) if str(hook_id or "").isdigit() else None
            repository.webhook_enabled = True
            repository.connection_verified_at = datetime.now(timezone.utc)
            db.add(repository)
            db.commit()
            db.refresh(repository)
            webhook_status = {
                "status": webhook_result.get("action", "configured"),
                "enabled": True,
                "webhook_id": repository.webhook_id,
                "callback_url": callback_url,
            }
        except GitHubAPIError as exc:
            repository.webhook_enabled = False
            db.add(repository)
            db.commit()
            db.refresh(repository)
            webhook_status = {
                "status": "failed",
                "enabled": False,
                "message": str(exc),
                "status_code": getattr(exc, "status_code", None),
            }
            logger.warning(
                "github:webhook_setup_failed user_id=%s repository_url=%s status_code=%s message=%s",
                user.id,
                normalized_url,
                getattr(exc, "status_code", None),
                str(exc),
            )
    else:
        repository.webhook_enabled = False
        db.add(repository)
        db.commit()
        db.refresh(repository)

    return {
        "message": "GitHub repository connected",
        "repository": _serialize_repository(repository),
        "webhook_status": webhook_status,
    }


@router.post("/webhook", name="github_webhook")
@webhook_router.post("/webhook", include_in_schema=False)
async def github_webhook(
    request: Request,
    x_github_event: str = Header(default="", alias="X-GitHub-Event"),
    x_hub_signature_256: str = Header(default="", alias="X-Hub-Signature-256"),
    x_github_delivery: str = Header(default="", alias="X-GitHub-Delivery"),
    db: Session = Depends(get_db),
):
    raw_body = await request.body()
    github_settings = get_effective_github_settings(db, settings)
    if not is_valid_github_signature(raw_body, x_hub_signature_256, github_settings.github_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = await request.json()

    if x_github_event == "ping":
        return {"status": "ok", "message": "Webhook received"}

    if x_github_event != "push":
        return {"status": "ignored", "event": x_github_event}

    try:
        result = process_push_webhook(db=db, settings=github_settings, payload=payload, delivery_id=x_github_delivery or None)
    except GitHubAPIError as exc:
        logger.warning(
            "github:webhook_github_api_error status_code=%s message=%s delivery_id=%s",
            getattr(exc, "status_code", None),
            str(exc),
            x_github_delivery or "",
        )
        raise HTTPException(status_code=_github_error_status_code(exc), detail="GitHub validation failed.") from exc
    except SQLAlchemyError as exc:
        logger.exception("github:webhook_database_error delivery_id=%s", x_github_delivery or "")
        raise HTTPException(status_code=500, detail="Unable to process GitHub webhook at this time.") from exc
    except Exception as exc:  # pragma: no cover - defensive boundary
        logger.exception("github:webhook_unhandled_error delivery_id=%s", x_github_delivery or "")
        raise HTTPException(status_code=500, detail="Unable to process GitHub webhook at this time.") from exc
    return result


@router.post("/stage-event")
def stage_event(
    payload: StageEventInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    github_settings = get_settings()
    client_user_id = int(payload.user_id or 0)
    if client_user_id and client_user_id != current_user.id:
        logger.warning(
            "github:stage_event_user_mismatch current_user_id=%s client_user_id=%s project_name=%s step_number=%s stage_index=%s",
            current_user.id,
            client_user_id,
            payload.project_name,
            payload.step_number,
            payload.stage_index,
        )

    try:
        result = resolve_stage_event(
            db,
            github_settings,
            user_id=current_user.id,
            project_name=payload.project_name,
            step_number=payload.step_number,
            stage_index=payload.stage_index,
            event_type=payload.event_type,
            actor=payload.actor,
            previous_status=payload.previous_status,
            current_status=payload.current_status,
            source_payload=payload.source_payload or {},
        )
    except GitHubAPIError as exc:
        logger.warning(
            "github:stage_event_github_api_error user_id=%s status_code=%s message=%s",
            current_user.id,
            getattr(exc, "status_code", None),
            str(exc),
        )
        raise HTTPException(status_code=_github_error_status_code(exc), detail="GitHub validation failed.") from exc
    except SQLAlchemyError as exc:
        logger.exception("github:stage_event_database_error user_id=%s", current_user.id)
        raise HTTPException(status_code=500, detail="Unable to process stage transition at this time.") from exc
    except Exception as exc:  # pragma: no cover - defensive boundary
        logger.exception("github:stage_event_unhandled_error user_id=%s", current_user.id)
        raise HTTPException(status_code=500, detail="Unable to process stage transition at this time.") from exc
    return result


@router.get("/reviews")
def get_review_history(
    request: Request,
    project_name: str | None = Query(default=None, min_length=1, max_length=160),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    normalized_project_name = str(project_name or "").strip()
    repository_query = db.query(GitHubRepository).filter(GitHubRepository.user_id == user.id)
    if normalized_project_name:
        repository = repository_query.filter(GitHubRepository.project_name.ilike(normalized_project_name)).first()
    else:
        repository = repository_query.order_by(desc(GitHubRepository.connected_at), desc(GitHubRepository.id)).first()

    if repository and not bool(getattr(repository, "webhook_enabled", False)):
        github_settings = get_effective_github_settings(db, settings)
        if github_settings.github_token and repository.repository_url:
            try:
                callback_url = str(request.url_for("github_webhook"))
                if is_repository_webhook_active(github_settings, repository.repository_url, callback_url=callback_url):
                    repository.webhook_enabled = True
                    repository.connection_verified_at = datetime.now(timezone.utc)
                    db.add(repository)
                    db.commit()
                    db.refresh(repository)
            except GitHubAPIError:
                logger.info(
                    "github:webhook_status_verify_failed user_id=%s project_name=%s repository_id=%s",
                    user.id,
                    normalized_project_name or getattr(repository, "project_name", ""),
                    repository.id,
                )

    review_query = db.query(CodeReview).filter(CodeReview.user_id == user.id)
    if normalized_project_name:
        review_query = review_query.filter(CodeReview.project_name.ilike(normalized_project_name))
    reviews = review_query.order_by(desc(CodeReview.created_at)).limit(25).all()

    latest_review = reviews[0] if reviews else None
    previous_reviews = reviews[1:] if len(reviews) > 1 else []
    commit_history = [
        {
            "commit_hash": item.commit_hash,
            "project_name": item.project_name,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "review_id": item.id,
        }
        for item in reviews
    ]

    return {
        "repository": _serialize_repository(repository, latest_review=latest_review),
        "latest_review": _serialize_review(latest_review) if latest_review else None,
        "previous_reviews": [_serialize_review(item) for item in previous_reviews],
        "commit_history": commit_history,
    }


def _send_review_email_safely(user: User, repository: GitHubRepository, review_row: CodeReview) -> dict:
    try:
        return send_review_summary_email(settings, user, repository, review_row)
    except Exception as exc:
        logger.exception(
            "github:manual_review_email_failed send_review_summary_email user_id=%s review_id=%s message=%s",
            user.id,
            review_row.id,
            str(exc),
        )
        return {"status": "failed", "reason": str(exc), "review_id": review_row.id, "user_id": user.id}


def _github_error_status_code(exc: GitHubAPIError) -> int:
    status_code = int(getattr(exc, "status_code", 0) or 0)
    if status_code in {400, 401, 403, 404, 409, 422, 429}:
        return status_code
    return 502
