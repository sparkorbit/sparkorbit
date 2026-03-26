from __future__ import annotations

from typing import Any

from .core.constants import DEFAULT_API_HOST, DEFAULT_API_PORT, DEFAULT_REDIS_URL
from .core.store import RedisStore


def create_app(store: Any | None = None):
    import threading

    from fastapi import APIRouter, FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from .api.routes.dashboard import router as dashboard_router
    from .api.routes.leaderboards import router as leaderboards_router
    from .api.routes.sessions import router as sessions_router
    from .core.constants import ACTIVE_SESSION_KEY
    from .services.session_service import (
        begin_homepage_bootstrap,
        run_homepage_bootstrap,
    )

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
    api_router.include_router(leaderboards_router)
    api_router.include_router(sessions_router)

    @api_router.get("/health")
    def read_health():
        return {"ok": True, "backend": "fastapi"}

    app.include_router(api_router)

    # Eagerly start data collection on boot if no active session exists
    def _eager_bootstrap() -> None:
        if resolved_store.get(ACTIVE_SESSION_KEY):
            return
        _bootstrap_state, should_start = begin_homepage_bootstrap(resolved_store)
        if not should_start:
            return
        run_homepage_bootstrap(resolved_store)

    threading.Thread(target=_eager_bootstrap, daemon=True).start()

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
