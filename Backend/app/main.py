import logging
import time
import uuid

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.db.database import Base, engine
from app.db import github_models, models  # noqa: F401
from app.routes import chat, deliverables, project
from app.core.config import get_settings

settings = get_settings()
allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [internlabs-api] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("internlabs-api")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="InternLabs API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    started_at = time.perf_counter()
    logger.info(
        "request:start request_id=%s method=%s path=%s client=%s",
        request_id,
        request.method,
        request.url.path,
        request.client.host if request.client else "",
    )
    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        logger.exception(
            "request:error request_id=%s method=%s path=%s duration_ms=%s message=%s",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
            str(exc),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error.", "request_id": request_id},
            headers={"x-request-id": request_id},
        )

    duration_ms = round((time.perf_counter() - started_at) * 1000)
    log = logger.error if response.status_code >= 500 else logger.warning if response.status_code >= 400 else logger.info
    log(
        "request:finish request_id=%s method=%s path=%s status=%s duration_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    response.headers["x-request-id"] = request_id
    return response


app.include_router(chat.router)
app.include_router(project.router)
app.include_router(deliverables.router)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "InternLabs API"}
