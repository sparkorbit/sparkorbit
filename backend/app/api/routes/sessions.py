from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from fastapi.responses import StreamingResponse

from ..dependencies import get_store
from ...core.store import RedisLike
from ...schemas.session import (
    ReloadSessionPayload,
    SessionReloadResponse,
    SessionReloadStateResponse,
)
from ...services.session_service import (
    get_session_reload_response,
    run_session_reload,
    start_session_reload,
)


router = APIRouter(tags=["sessions"])

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.get(
    "/sessions/reload",
    response_model=SessionReloadStateResponse,
)
def read_session_reload(
    store: RedisLike = Depends(get_store),
) -> SessionReloadStateResponse:
    return SessionReloadStateResponse(**get_session_reload_response(store))


@router.get("/sessions/reload/stream")
async def stream_session_reload(
    request: Request,
    store: RedisLike = Depends(get_store),
) -> StreamingResponse:
    async def event_stream():
        last_payload: str | None = None
        yield "retry: 1000\n\n"

        while True:
            if await request.is_disconnected():
                break

            payload = get_session_reload_response(store)
            serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            if serialized != last_payload:
                last_payload = serialized
                yield f"data: {serialized}\n\n"

            if payload["status"] in {"idle", "ready", "partial_error", "error"}:
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


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
            profile=payload.profile,
            limit=payload.limit,
            output_dir=payload.output_dir,
            run_label=payload.run_label,
            timeout=payload.timeout,
        ),
        sources=payload.sources,
        profile=payload.profile,
        limit=payload.limit,
        output_dir=payload.output_dir,
        run_label=payload.run_label,
        timeout=payload.timeout,
    )
    return SessionReloadResponse(
        session_id=result["session_id"],
        status=result["status"],
        loading=result["loading"],
        error=result["error"],
    )
