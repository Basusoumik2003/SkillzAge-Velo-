import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import User

# Tokens are issued by the Node "Skillzage-auth" service and verified here
# using the shared HS256 secret (JWT_SECRET_KEY, same value as that
# service's JWT_SECRET / the gateway's JWT_SECRET_KEY).
_bearer_scheme = HTTPBearer(auto_error=False)
_DEV_USER_ID = uuid.UUID("fc0628de-1939-41e0-b28e-760e4473de68")
_DEV_USER_EMAIL = "dev-auth-user@local"
_DEV_USER_NAME = "Local Dev User"


def _should_bypass_auth(settings) -> bool:
    return bool(settings.bypass_api_auth or not settings.jwt_secret_key or settings.jwt_secret_key == "change_me")


def _get_bypass_user(db: Session) -> User:
    user = db.query(User).filter(User.id == _DEV_USER_ID).first()
    if user is not None:
        return user

    user = db.query(User).filter(User.email == _DEV_USER_EMAIL).first()
    if user is not None:
        return user

    user = User(id=_DEV_USER_ID, name=_DEV_USER_NAME, email=_DEV_USER_EMAIL)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    settings = get_settings()
    if _should_bypass_auth(settings):
        return _get_bypass_user(db)

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token.",
        )

    # The Node auth service (Backend/Skillzage-auth) and the Wix member-sync
    # backend sign tokens with the shared HS256 secret but WITHOUT `aud`/`iss`
    # claims. python-jose rejects a token that lacks a claim we ask it to
    # verify, so only enforce aud/iss when the token actually carries them
    # (defence in depth) - the shared secret + the gateway boundary is the
    # real trust check.
    try:
        unverified = jwt.get_unverified_claims(credentials.credentials)
    except JWTError:
        unverified = {}

    decode_kwargs: dict = {"algorithms": ["HS256"]}
    if settings.jwt_audience and unverified.get("aud"):
        decode_kwargs["audience"] = settings.jwt_audience
    else:
        decode_kwargs["options"] = {"verify_aud": False}
    if settings.jwt_issuer and unverified.get("iss"):
        decode_kwargs["issuer"] = settings.jwt_issuer

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            **decode_kwargs,
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token.",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    return user


def require_admin(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    """Gate for the deliverable admin endpoints - mirrors adminService's
    requireAdmin() (Backend/adminService/src/routes/startupRoutes.js), which
    checks the same `admin_credentials` table joined on email. That table has
    no SQLAlchemy model in this app (it's owned/managed by adminService), so
    it's queried with raw SQL, same as journey_phases/journey_stages
    elsewhere (see app/services/startup_progress.py)."""
    settings = get_settings()
    if _should_bypass_auth(settings):
        return user

    row = db.execute(
        text(
            """
            SELECT ac.id
            FROM admin_credentials ac
            WHERE LOWER(ac.email) = LOWER(:email)
              AND ac.is_active = TRUE
              AND ac.can_access_admin = TRUE
            LIMIT 1
            """
        ),
        {"email": user.email},
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access is required.",
        )

    return user
