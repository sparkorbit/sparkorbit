from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, status

from ..dependencies import get_store
from ...core.store import RedisLike
from ...schemas.session import (
    ReloadSessionPayload,
    SessionReloadResponse,
)
from ...services.session_service import (
    run_session_reload,
    start_session_reload,
)


router = APIRouter(tags=["sessions"])


@router.post(
    "/sessions/reload",
    response_model=SessionReloadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_session_reload(
    background_tasks: BackgroundTasks,
    payload: ReloadSessionPayload,
    store: RedisLike = Depends(get_store),
) -> SessionReloadResponse:
    result = start_session_reload(
        store,
        schedule_reload=lambda: background_tasks.add_task(
            run_session_reload,
            store,
            sources=payload.sources,
            limit=payload.limit,
            output_dir=payload.output_dir,
            run_label=payload.run_label,
            timeout=payload.timeout,
        ),
    )
    return SessionReloadResponse(
        session_id=result["session_id"],
        status=result["status"],
        error=result["error"],
    )
