from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_store
from ...core.store import RedisLike
from ...schemas.jobs import ActiveJobResponse, JobProgressResponse
from ...services.job_progress import get_active_job, get_job_progress


router = APIRouter(tags=["jobs"])


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
