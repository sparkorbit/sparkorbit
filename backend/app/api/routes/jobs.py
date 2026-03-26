from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..dependencies import get_store
from ...core.store import RedisLike
from ...schemas.jobs import ActiveJobResponse, JobProgressResponse
from ...services.job_progress import get_active_job, get_job_progress


router = APIRouter(tags=["jobs"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

_TERMINAL_STATUSES = {"ready", "error", "partial_error"}


@router.get(
    "/jobs/active",
    response_model=ActiveJobResponse | None,
)
def read_active_job(
    surface: str = "dashboard",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any] | None:
    return get_active_job(store, surface=surface)


@router.get(
    "/jobs/{job_id}/stream",
)
async def stream_job_progress(
    job_id: str,
    request: Request,
    store: RedisLike = Depends(get_store),
) -> StreamingResponse:
    async def event_stream():
        yield "retry: 1000\n\n"
        while True:
            if await request.is_disconnected():
                break
            payload = get_job_progress(store, job_id=job_id)
            if payload is None:
                yield f"event: stream_error\ndata: {json.dumps({'detail': f'Unknown job: {job_id}'}, ensure_ascii=False)}\n\n"
                break
            serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            yield f"data: {serialized}\n\n"
            if payload.get("status") in _TERMINAL_STATUSES:
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get(
    "/jobs/{job_id}",
    response_model=JobProgressResponse,
)
def read_job_progress(
    job_id: str,
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    payload = get_job_progress(store, job_id=job_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Unknown job: {job_id}")
    return payload
