from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_store
from ...core.store import RedisLike
from ...services.session_service import (
    get_leaderboard_response,
)


router = APIRouter(tags=["leaderboards"])


@router.get("/leaderboards")
def read_leaderboards(
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    try:
        return get_leaderboard_response(store, session=session)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
