from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_store
from ...core.store import RedisLike
from ...services.session_service import (
    get_dashboard_response,
    get_digest_response,
    get_document_response,
)


router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def read_dashboard(
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    try:
        return get_dashboard_response(store, session=session)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/digests/{digest_id}")
def read_digest(
    digest_id: str,
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    try:
        return get_digest_response(store, digest_id=digest_id, session=session)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/documents/{document_id}")
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
