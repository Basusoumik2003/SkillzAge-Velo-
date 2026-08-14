from types import SimpleNamespace

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.github_models import GitHubAppSettings


def get_effective_github_settings(db: Session, settings: Settings) -> Settings:
    row = (
        db.query(GitHubAppSettings)
        .filter(GitHubAppSettings.is_active.is_(True))
        .order_by(desc(GitHubAppSettings.updated_at), desc(GitHubAppSettings.id))
        .first()
    )
    if not row:
        return settings

    values = dict(settings.model_dump())
    github_token = str(row.github_token or "").strip()
    webhook_secret = str(row.webhook_secret or "").strip()
    if github_token:
        values["github_token"] = github_token
    if webhook_secret:
        values["github_webhook_secret"] = webhook_secret
    return SimpleNamespace(**values)
