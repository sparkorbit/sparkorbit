from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from ..dependencies import get_store
from ...core.store import RedisLike
from ...schemas.session import (
    ReloadSessionPayload,
    SessionReloadResponse,
)
from ...services.session_service import (
    normalize_reload_output_dir,
    run_session_reload,
    start_session_reload,
    validate_reload_sources,
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
    try:
        validate_reload_sources(payload.sources)
        output_dir = normalize_reload_output_dir(payload.output_dir)
        result = start_session_reload(
            store,
            schedule_reload=lambda job_id: background_tasks.add_task(
                run_session_reload,
                store,
                sources=payload.sources,
                limit=payload.limit,
                output_dir=output_dir,
                run_label=payload.run_label,
                timeout=payload.timeout,
                queue=payload.queue,
                job_id=job_id,
            ),
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SessionReloadResponse(
        session_id=result["session_id"],
        status=result["status"],
        error=result["error"],
        job_id=result.get("job_id"),
        poll_path=result.get("poll_path"),
    )
