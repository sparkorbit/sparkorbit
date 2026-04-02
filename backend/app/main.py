from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

from .core.constants import DEFAULT_API_HOST, DEFAULT_API_PORT, DEFAULT_REDIS_URL
from .core.store import RedisStore

logger = logging.getLogger(__name__)
_INLINE_ENRICHMENT_WORKER_LOCK = threading.Lock()
_INLINE_ENRICHMENT_WORKER_STARTED = False
_INLINE_ENRICHMENT_WORKER_DISABLED_VALUES = frozenset(
    {"0", "false", "off", "no", "disabled"}
)


def _allowed_origins() -> list[str]:
    raw = os.environ.get("SPARKORBIT_ALLOWED_ORIGINS", "")
    if raw.strip():
        seen: list[str] = []
        for item in raw.split(","):
            origin = item.strip().rstrip("/")
            if origin and origin not in seen:
                seen.append(origin)
        if seen:
            return seen
    return [
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def _inline_enrichment_worker_enabled(store: Any) -> bool:
    if not isinstance(store, RedisStore):
        return False

    raw = str(os.environ.get("SPARKORBIT_INLINE_ENRICHMENT_WORKER", "1")).strip()
    return raw.lower() not in _INLINE_ENRICHMENT_WORKER_DISABLED_VALUES


def _start_inline_enrichment_worker(store: RedisStore) -> None:
    global _INLINE_ENRICHMENT_WORKER_STARTED

    if not _inline_enrichment_worker_enabled(store):
        return

    with _INLINE_ENRICHMENT_WORKER_LOCK:
        if _INLINE_ENRICHMENT_WORKER_STARTED:
            return
        _INLINE_ENRICHMENT_WORKER_STARTED = True

    from .services.session_service import process_enrichment_queue

    poll_interval = max(
        0.25,
        float(os.environ.get("SPARKORBIT_WORKER_POLL_INTERVAL", "2")),
    )

    def _run() -> None:
        while True:
            try:
                process_enrichment_queue(store, once=True)
            except Exception as exc:  # pragma: no cover - best effort daemon
                logger.warning("Inline enrichment worker failed: %s", exc)
            time.sleep(poll_interval)

    threading.Thread(
        target=_run,
        daemon=True,
        name="sparkorbit-inline-enrichment",
    ).start()


def create_app(store: Any | None = None):
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
    _start_inline_enrichment_worker(resolved_store)

    app = FastAPI(title="SparkOrbit Backend", version="0.1.0")
    app.state.store = resolved_store
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
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
