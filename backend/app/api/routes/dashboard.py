from __future__ import annotations

import asyncio
import json
import threading
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..dependencies import get_store
from ...core.store import RedisLike
from ...services.session_service import (
    get_or_bootstrap_dashboard_response,
    get_dashboard_response,
    get_digest_response,
    get_document_response,
    run_homepage_bootstrap,
)


router = APIRouter(tags=["dashboard"])

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.get("/dashboard")
def read_dashboard(
    background_tasks: BackgroundTasks,
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    try:
        if session == "active":
            return get_or_bootstrap_dashboard_response(
                store,
                schedule_bootstrap=lambda: background_tasks.add_task(
                    run_homepage_bootstrap,
                    store,
                ),
            )
        return get_dashboard_response(store, session=session)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/stream")
async def stream_dashboard(
    request: Request,
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> StreamingResponse:
    def schedule_bootstrap() -> None:
        threading.Thread(
            target=run_homepage_bootstrap,
            kwargs={"store": store},
            daemon=True,
        ).start()

    async def event_stream():
        last_payload: str | None = None
        heartbeat_tick = 0
        yield "retry: 1000\n\n"

        while True:
            if await request.is_disconnected():
                break

            try:
                if session == "active":
                    payload = get_or_bootstrap_dashboard_response(
                        store,
                        schedule_bootstrap=schedule_bootstrap,
                    )
                else:
                    payload = get_dashboard_response(store, session=session)
            except KeyError as exc:
                yield f"event: error\ndata: {json.dumps({'detail': str(exc)}, ensure_ascii=False)}\n\n"
                break

            serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            if serialized != last_payload:
                last_payload = serialized
                yield f"data: {serialized}\n\n"
                heartbeat_tick = 0
            else:
                heartbeat_tick += 1
                if heartbeat_tick >= 20:
                    yield ": keep-alive\n\n"
                    heartbeat_tick = 0

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("/digests/{digest_id:path}")
def read_digest(
    digest_id: str,
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    try:
        return get_digest_response(store, digest_id=digest_id, session=session)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/documents/{document_id:path}")
def read_document(
    document_id: str,
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    try:
        return get_document_response(
            store,
            document_id=document_id,
            session=session,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
