from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

from ..core.constants import DEFAULT_COLLECTION_PROFILE, DEFAULT_RUN_LABEL


class ReloadSessionPayload(BaseModel):
    profile: str = DEFAULT_COLLECTION_PROFILE
    limit: int | None = None
    run_label: str = DEFAULT_RUN_LABEL
    sources: list[str] | None = None
    output_dir: str | None = None
    timeout: float = 30.0
    queue: bool = True


class SessionReloadResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str | None
    status: str
    loading: dict[str, Any] | None = None
    error: str | None = None


class SessionReloadStateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str | None
    status: str
    loading: dict[str, Any] | None = None
    error: str | None = None
