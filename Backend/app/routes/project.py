from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Project, ProjectProgress, Subscription, User
from app.routes.auth import get_current_user
from app.services.context_builder import is_startup_project
from app.services.resume_parser import extract_resume_text
from app.services.startup_progress import ensure_student_profile, get_startup_progress_state

router = APIRouter(prefix="/project", tags=["project"])


class SelectProjectInput(BaseModel):
    project_name: str


def _active_project_titles(db: Session, *, demo_only: bool = False) -> list[str]:
    query = db.query(Project).filter(Project.is_active == True)  # noqa: E712
    if demo_only:
        query = query.filter(Project.is_demo_project == True)  # noqa: E712
    rows = query.order_by(Project.created_at.desc(), Project.id.desc()).all()
    return [row.title for row in rows if row.title]


@router.post("/resume")
async def upload_resume(
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    content = await resume.read()
    parsed = extract_resume_text(content)
    user.resume_text = parsed
    db.add(user)
    db.commit()
    return {"message": "Resume uploaded", "has_resume": bool(parsed)}


@router.get("/recommendations")
def get_recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    has_active_subscription = bool(
        subscription
        and subscription.status == "active"
        and (subscription.current_period_end is None or subscription.current_period_end > datetime.now(timezone.utc))
    )

    if not has_active_subscription:
        return {"projects": _active_project_titles(db, demo_only=True), "access": "demo"}

    return {"projects": _active_project_titles(db), "access": "full"}


@router.post("/select")
def select_project(
    payload: SelectProjectInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if is_startup_project(payload.project_name):
        # Startup-journey projects aren't in the `projects` catalog table and
        # don't use project_progress - "selecting" one just means the student
        # has a student_profiles row; per-stage progress lives in
        # student_stage_progress (see app/services/startup_progress.py).
        ensure_student_profile(db, user.id)
        state = get_startup_progress_state(db, user.id)
        return {
            "message": "Project selected",
            "project": {
                "name": payload.project_name,
                "current_step": state["current_step"],
                "completed_tasks": state["completed_tasks"],
            },
        }

    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    has_active_subscription = bool(
        subscription
        and subscription.status == "active"
        and (subscription.current_period_end is None or subscription.current_period_end > datetime.now(timezone.utc))
    )
    allowed_projects = _active_project_titles(db, demo_only=not has_active_subscription)

    if payload.project_name not in allowed_projects:
        raise HTTPException(status_code=400, detail="Unsupported project")

    progress = (
        db.query(ProjectProgress)
        .filter(ProjectProgress.user_id == user.id, ProjectProgress.project_name == payload.project_name)
        .first()
    )
    if not progress:
        progress = ProjectProgress(user_id=user.id, project_name=payload.project_name, current_step=1, completed_tasks="")
        db.add(progress)
        db.commit()
        db.refresh(progress)

    return {
        "message": "Project selected",
        "project": {
            "name": progress.project_name,
            "current_step": progress.current_step,
            "completed_tasks": [t for t in (progress.completed_tasks or "").split("||") if t],
        },
    }


@router.get("/progress")
def get_progress(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    records = db.query(ProjectProgress).filter(ProjectProgress.user_id == user.id).all()
    return {
        "progress": [
            {
                "project_name": row.project_name,
                "current_step": row.current_step,
                "completed_tasks": [t for t in (row.completed_tasks or "").split("||") if t],
            }
            for row in records
        ]
    }
