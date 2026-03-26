from __future__ import annotations

from typing import Any

from .core.constants import DEFAULT_API_HOST, DEFAULT_API_PORT, DEFAULT_REDIS_URL
from .core.store import RedisStore


def create_app(store: Any | None = None):
    import threading

    from fastapi import APIRouter, FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from .api.routes.dashboard import router as dashboard_router
    from .api.routes.jobs import router as jobs_router
    from .api.routes.leaderboards import router as leaderboards_router
    from .api.routes.sessions import router as sessions_router
    import uuid

    from .core.constants import ACTIVE_SESSION_KEY
    from .services.job_progress import JobProgressTracker, get_active_job_id
    from .services.session_service import run_homepage_bootstrap

    resolved_store = store or RedisStore()
    app = FastAPI(title="SparkOrbit Backend", version="0.1.0")
    app.state.store = resolved_store
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    api_router = APIRouter(prefix="/api")
    api_router.include_router(dashboard_router)
    api_router.include_router(jobs_router)
    api_router.include_router(leaderboards_router)
    api_router.include_router(sessions_router)

    @api_router.get("/health")
    def read_health():
        return {"ok": True, "backend": "fastapi"}

    app.include_router(api_router)

    # Eagerly start data collection on boot if no active session exists.
    # Pre-register the job in the main thread so fetchActiveJob returns it
    # immediately, before the background thread has had a chance to run.
    if not resolved_store.get(ACTIVE_SESSION_KEY) and not get_active_job_id(resolved_store, "dashboard"):
        bootstrap_job_id = str(uuid.uuid4())
        _bootstrap_tracker = JobProgressTracker(
            resolved_store,
            job_id=bootstrap_job_id,
            surface="dashboard",
            job_type="session_loading",
        )
        _bootstrap_tracker.flush(force=True)

        def _run_bootstrap() -> None:
            run_homepage_bootstrap(resolved_store, job_id=bootstrap_job_id)

        threading.Thread(target=_run_bootstrap, daemon=True).start()

    return app


def serve(
    *,
    host: str = DEFAULT_API_HOST,
    port: int = DEFAULT_API_PORT,
    redis_url: str = DEFAULT_REDIS_URL,
) -> None:
    import uvicorn

    store = RedisStore(url=redis_url)
    app = create_app(store)
    uvicorn.run(app, host=host, port=port)
