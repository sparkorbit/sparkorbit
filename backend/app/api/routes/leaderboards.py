from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from ..dependencies import get_store
from ...core.store import RedisLike
from ...services.session_service import (
    build_leaderboard_response_from_dashboard,
    get_leaderboard_response,
    get_or_bootstrap_dashboard_response,
    run_homepage_bootstrap,
)


router = APIRouter(tags=["leaderboards"])


@router.get("/leaderboards")
def read_leaderboards(
    background_tasks: BackgroundTasks,
    session: str = "active",
    store: RedisLike = Depends(get_store),
) -> dict[str, Any]:
    try:
        if session == "active":
            dashboard = get_or_bootstrap_dashboard_response(
                store,
                schedule_bootstrap=lambda: background_tasks.add_task(
                    run_homepage_bootstrap,
                    store,
                ),
            )
            if dashboard.get("status") == "collecting":
                return build_leaderboard_response_from_dashboard(dashboard)
        return get_leaderboard_response(store, session=session)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
