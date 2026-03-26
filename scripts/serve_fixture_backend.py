from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.core.store import MemoryStore
from backend.app.main import create_app
from backend.app.services.session_service import publish_run, run_session_enrichment
from backend.app.services.summary_provider import NoopSummaryGenerator


DEFAULT_RUN_IDS = ("2026-03-25T150713Z_data-test",)


def build_store() -> MemoryStore:
    store = MemoryStore()
    raw_run_ids = os.environ.get("SPARKORBIT_FIXTURE_RUN_IDS", "")
    run_ids = [
        run_id.strip()
        for run_id in raw_run_ids.split(",")
        if run_id.strip()
    ] or list(DEFAULT_RUN_IDS)

    for run_id in run_ids:
        run_dir = (
            ROOT_DIR
            / "pipelines"
            / "source_fetch"
            / "data"
            / "runs"
            / run_id
        )
        if not run_dir.exists():
            raise FileNotFoundError(f"Fixture run not found: {run_dir}")
        publish_run(store, run_dir, queue=False)
        run_session_enrichment(
            store,
            run_id,
            generator=NoopSummaryGenerator(),
            briefing_generator=None,
        )

    return store


def main() -> None:
    host = os.environ.get("SPARKORBIT_FIXTURE_HOST", "127.0.0.1")
    port = int(os.environ.get("SPARKORBIT_FIXTURE_PORT", "8787"))
    app = create_app(build_store())
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
