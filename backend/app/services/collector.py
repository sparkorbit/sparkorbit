from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from ..core.constants import (
    DEFAULT_RUNS_DIR,
    DEFAULT_RUN_LABEL,
    SOURCE_FETCH_SCRIPTS_DIR,
)


def resolve_requested_sources(sources: list[str] | None = None) -> list[Any]:
    scripts_dir = str(SOURCE_FETCH_SCRIPTS_DIR)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)

    from source_fetch.adapters import resolve_sources  # type: ignore

    return resolve_sources(sources or ["all"])


def collect_run(
    *,
    sources: list[str] | None = None,
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
    progress_callback: Any | None = None,
) -> tuple[dict[str, Any], Path]:
    scripts_dir = str(SOURCE_FETCH_SCRIPTS_DIR)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)

    from source_fetch.pipeline import run_collection  # type: ignore

    resolve_requested_sources(sources)

    return run_collection(
        sources=sources or ["all"],
        limit=limit,
        output_dir=str(output_dir or DEFAULT_RUNS_DIR),
        run_label=run_label,
        timeout=timeout,
        progress_callback=progress_callback,
    )
