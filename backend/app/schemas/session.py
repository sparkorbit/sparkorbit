from __future__ import annotations

from pydantic import BaseModel

from ..core.constants import DEFAULT_RUN_LABEL


class ReloadSessionPayload(BaseModel):
    limit: int | None = None
    run_label: str = DEFAULT_RUN_LABEL
    sources: list[str] | None = None
    output_dir: str | None = None
    timeout: float = 30.0
    queue: bool = True


class SessionReloadResponse(BaseModel):
    session_id: str | None
    status: str
    error: str | None = None
