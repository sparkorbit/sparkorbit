from __future__ import annotations

import re
from pathlib import Path

from pydantic import BaseModel, Field, field_validator

from ..core.constants import DEFAULT_RUN_LABEL, DEFAULT_RUNS_DIR


_RUN_LABEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_SOURCE_NAME_RE = re.compile(r"^[a-z0-9_]+$")
_RUNS_ROOT = DEFAULT_RUNS_DIR.resolve(strict=False)


class ReloadSessionPayload(BaseModel):
    limit: int | None = Field(default=None, ge=1, le=100)
    run_label: str = Field(default=DEFAULT_RUN_LABEL, min_length=1, max_length=64)
    sources: list[str] | None = None
    output_dir: str | None = None
    timeout: float = Field(default=30.0, gt=0.0, le=300.0)
    queue: bool = True

    @field_validator("run_label")
    @classmethod
    def validate_run_label(cls, value: str) -> str:
        normalized = value.strip()
        if not _RUN_LABEL_RE.fullmatch(normalized):
            raise ValueError(
                "run_label must be 1-64 chars using only letters, numbers, '.', '_', or '-'."
            )
        return normalized

    @field_validator("sources")
    @classmethod
    def validate_sources(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized: list[str] = []
        for item in value:
            source = str(item).strip()
            if not source:
                raise ValueError("sources cannot include empty values.")
            if not _SOURCE_NAME_RE.fullmatch(source):
                raise ValueError("sources must use lowercase letters, numbers, and underscores only.")
            if source not in normalized:
                normalized.append(source)
        if "all" in normalized and len(normalized) > 1:
            raise ValueError("'all' cannot be combined with specific sources.")
        return normalized

    @field_validator("output_dir")
    @classmethod
    def validate_output_dir(cls, value: str | None) -> str | None:
        if value is None:
            return None
        candidate = Path(value).expanduser()
        if not candidate.is_absolute():
            candidate = DEFAULT_RUNS_DIR / candidate
        resolved = candidate.resolve(strict=False)
        try:
            resolved.relative_to(_RUNS_ROOT)
        except ValueError as exc:
            raise ValueError(
                f"output_dir must stay within {DEFAULT_RUNS_DIR}."
            ) from exc
        return str(resolved)


class SessionReloadResponse(BaseModel):
    session_id: str | None
    status: str
    error: str | None = None
    job_id: str | None = None
    poll_path: str | None = None
