"""Regression tests for LLM regeneration after a session is republished."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make backend importable when running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.core.store import MemoryStore
from backend.app.services.session_service import (
    doc_key,
    get_json,
    publish_run,
    run_session_enrichment,
    session_key,
)


RUN_FIXTURE_DIR = (
    Path(__file__).resolve().parents[1]
    / "pipelines"
    / "source_fetch"
    / "data"
    / "runs"
    / "2026-03-25T150713Z_data-test"
)


def require_run_fixture(path: Path) -> Path:
    if not path.exists():
        pytest.skip(f"Run artifact not found: {path}")
    return path


class StubSummaryGenerator:
    provider_name = "stub"
    model_name = "stub-model"
    prompt_version = "stub-prompt"
    fewshot_pack_version = "stub-pack"

    def __init__(self, tag: str) -> None:
        self.tag = tag
        self.calls: list[str] = []

    def summarize_document(self, document: dict[str, object]) -> dict[str, object]:
        document_id = str(document.get("document_id") or "")
        self.calls.append(document_id)
        return {
            "status": "complete",
            "summary_1l": f"{self.tag} one-line {document_id}",
            "summary_short": f"{self.tag} short {document_id}",
            "key_points": [f"{self.tag} key point"],
            "entities": [self.tag],
            "importance_reason": f"{self.tag} importance",
            "run_meta": {
                "model_name": self.model_name,
                "prompt_version": self.prompt_version,
                "fewshot_pack_version": self.fewshot_pack_version,
                "generated_at": f"{self.tag}-generated-at",
            },
        }


class StubBriefingGenerator:
    def __init__(self, tag: str) -> None:
        self.tag = tag

    def generate_briefing(self, briefing_input: dict[str, object]) -> dict[str, object]:
        return {
            "body_en": f"{self.tag} briefing",
            "category_summaries": {
                "company": f"{self.tag} company summary",
                "papers": f"{self.tag} paper summary",
            },
            "run_meta": {
                "model_name": "stub-briefing-model",
                "prompt_version": "stub-briefing-prompt",
                "generated_at": f"{self.tag}-briefing-generated-at",
            },
        }


def test_force_refresh_reruns_document_summaries_and_briefing() -> None:
    store = MemoryStore()
    publish_result = publish_run(store, require_run_fixture(RUN_FIXTURE_DIR), queue=False)
    session_id = str(publish_result["session_id"])

    initial_meta = get_json(store, session_key(session_id, "meta"))
    assert initial_meta["llm_refresh_required"] is True
    assert initial_meta["llm_refresh_completed_at"] is None

    first_summary_generator = StubSummaryGenerator("first")
    first_briefing_generator = StubBriefingGenerator("first")
    run_session_enrichment(
        store,
        session_id,
        generator=first_summary_generator,
        briefing_generator=first_briefing_generator,
    )

    assert first_summary_generator.calls
    first_document_id = first_summary_generator.calls[0]
    first_document = get_json(store, doc_key(session_id, first_document_id))
    assert first_document["llm"]["summary_short"] == f"first short {first_document_id}"
    assert (
        get_json(store, session_key(session_id, "briefing"))["body_en"]
        == "first briefing"
    )

    first_meta = get_json(store, session_key(session_id, "meta"))
    assert first_meta["llm_refresh_required"] is False
    assert first_meta["llm_refresh_completed_at"]

    second_summary_generator = StubSummaryGenerator("second")
    second_briefing_generator = StubBriefingGenerator("second")
    run_session_enrichment(
        store,
        session_id,
        generator=second_summary_generator,
        briefing_generator=second_briefing_generator,
        force_refresh=True,
    )

    assert second_summary_generator.calls
    assert sorted(second_summary_generator.calls) == sorted(first_summary_generator.calls)

    refreshed_document = get_json(store, doc_key(session_id, first_document_id))
    assert (
        refreshed_document["llm"]["summary_short"]
        == f"second short {first_document_id}"
    )
    assert (
        refreshed_document["llm"]["run_meta"]["generated_at"]
        == "second-generated-at"
    )
    assert (
        get_json(store, session_key(session_id, "briefing"))["body_en"]
        == "second briefing"
    )

    refreshed_meta = get_json(store, session_key(session_id, "meta"))
    assert refreshed_meta["llm_refresh_required"] is False
    assert refreshed_meta["llm_refresh_completed_at"]
