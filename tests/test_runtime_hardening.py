"""Regression tests for runtime hardening and safer defaults."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

# Make backend importable when running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.core.constants import ACTIVE_SESSION_KEY, SCHEMA_VERSION
from backend.app.core.store import MemoryStore
from backend.app.main import create_app
from backend.app.services.session_service import (
    SESSION_LLM_ERRORS_FILENAME,
    artifact_root_key,
    dequeue_session_for_enrichment,
    doc_key,
    enqueue_session_for_enrichment,
    feed_key,
    run_session_enrichment,
    session_key,
)


def build_idle_client() -> TestClient:
    store = MemoryStore()
    store.set(ACTIVE_SESSION_KEY, "fixture-session")
    return TestClient(create_app(store))


def test_reload_session_rejects_invalid_limits_and_paths() -> None:
    client = build_idle_client()

    invalid_payloads = [
        {"limit": -1},
        {"timeout": 0},
        {"run_label": "../escape"},
        {"run_label": "bad/value"},
        {"output_dir": "/tmp/outside-root"},
        {"sources": ["all", "hf_trending_models"]},
        {"sources": ["../../bad"]},
    ]

    for payload in invalid_payloads:
        response = client.post("/api/sessions/reload", json=payload)
        assert response.status_code == 422, payload


def test_reload_session_rejects_unknown_source_names() -> None:
    client = build_idle_client()

    response = client.post(
        "/api/sessions/reload",
        json={"sources": ["hf_trending_models", "unknown_source"]},
    )

    assert response.status_code == 422
    assert "Unknown source" in response.text


def test_default_cors_allows_loopback_and_blocks_untrusted_origins() -> None:
    client = build_idle_client()

    allowed = client.options(
        "/api/sessions/reload",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    blocked = client.options(
        "/api/sessions/reload",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert blocked.status_code == 400
    assert blocked.headers.get("access-control-allow-origin") is None


def test_enrichment_queue_deduplicates_session_ids() -> None:
    store = MemoryStore()

    enqueue_session_for_enrichment(store, "session-1")
    enqueue_session_for_enrichment(store, "session-1")
    enqueue_session_for_enrichment(store, "session-2")

    assert dequeue_session_for_enrichment(store) == "session-1"
    assert dequeue_session_for_enrichment(store) == "session-2"
    assert dequeue_session_for_enrichment(store) is None


def test_run_session_enrichment_marks_partial_error_when_briefing_crashes() -> None:
    class StubSummaryGenerator:
        provider_name = "heuristic"
        model_name = "stub-summary"
        prompt_version = "stub"
        fewshot_pack_version = "stub"

        def summarize_document(self, document: dict[str, object]) -> dict[str, object]:
            return {
                "status": "complete",
                "summary_1l": "one line",
                "summary_short": "summary",
                "key_points": ["point"],
                "entities": [],
                "run_meta": {
                    "model_name": self.model_name,
                    "prompt_version": self.prompt_version,
                    "fewshot_pack_version": self.fewshot_pack_version,
                    "generated_at": "2026-03-29T00:00:00Z",
                },
            }

    class FailingBriefingGenerator:
        model_name = "stub-briefing"
        prompt_version = "stub"

        def generate_briefing(self, briefing_input: dict[str, object]) -> dict[str, object]:
            raise RuntimeError("boom")

    store = MemoryStore()
    session_id = "session-hardening"
    document_id = "doc-1"
    source_id = "hn_topstories"

    meta = {
        "schema_version": SCHEMA_VERSION,
        "session_id": session_id,
        "run_id": session_id,
        "status": "published",
        "source_ids": [source_id],
        "llm_refresh_required": True,
        "llm_refresh_completed_at": None,
    }
    run_manifest = {"run_id": session_id}
    document = {
        "document_id": document_id,
        "source": source_id,
        "source_category": "community",
        "title": "Test document",
        "url": "https://example.com/doc",
        "reference_url": "https://example.com/doc",
        "published_at": "2026-03-29T00:00:00Z",
        "sort_at": "2026-03-29T00:00:00Z",
        "summary_input_text": "Test document body",
        "text_scope": "body",
        "llm": {"status": "pending"},
        "ranking": {"feed_score": 10},
        "discovery": {"spark_score": 10},
        "engagement": {},
        "metadata": {},
        "tags": [],
        "labels": {},
    }

    store.set(session_key(session_id, "meta"), json.dumps(meta))
    store.set(session_key(session_id, "run_manifest"), json.dumps(run_manifest))
    store.set(session_key(session_id, "source_manifest"), "[]")
    store.set(artifact_root_key(session_id), json.dumps("/tmp/nonexistent-run"))
    store.rpush(feed_key(session_id, source_id), document_id)
    store.set(doc_key(session_id, document_id), json.dumps(document))

    result = run_session_enrichment(
        store,
        session_id,
        generator=StubSummaryGenerator(),
        briefing_generator=FailingBriefingGenerator(),
    )

    refreshed_meta = json.loads(store.get(session_key(session_id, "meta")) or "{}")
    briefing = json.loads(store.get(session_key(session_id, "briefing")) or "{}")

    assert result["meta"]["status"] == "partial_error"
    assert refreshed_meta["status"] == "partial_error"
    assert refreshed_meta["llm_refresh_required"] is True
    assert briefing["error"].startswith("Briefing generation failed:")


def test_run_session_enrichment_records_llm_error_code_and_report(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("SPARKORBIT_BRIEFING_PROVIDER", "ollama")

    class StubSummaryGenerator:
        provider_name = "heuristic"
        model_name = "stub-summary"
        prompt_version = "stub"
        fewshot_pack_version = "stub"

        def summarize_document(self, document: dict[str, object]) -> dict[str, object]:
            return {
                "status": "complete",
                "summary_1l": "one line",
                "summary_short": "summary",
                "key_points": ["point"],
                "entities": [],
                "run_meta": {
                    "model_name": self.model_name,
                    "prompt_version": self.prompt_version,
                    "fewshot_pack_version": self.fewshot_pack_version,
                    "generated_at": "2026-03-29T00:00:00Z",
                },
            }

    class FailingBriefingGenerator:
        model_name = "stub-briefing"
        prompt_version = "stub"

        def generate_briefing(self, briefing_input: dict[str, object]) -> dict[str, object]:
            raise RuntimeError("boom")

    store = MemoryStore()
    session_id = "session-hardening-report"
    document_id = "doc-1"
    source_id = "hn_topstories"
    run_dir = tmp_path / session_id

    meta = {
        "schema_version": SCHEMA_VERSION,
        "session_id": session_id,
        "run_id": session_id,
        "status": "published",
        "source_ids": [source_id],
        "llm_refresh_required": True,
        "llm_refresh_completed_at": None,
    }
    run_manifest = {"run_id": session_id}
    document = {
        "document_id": document_id,
        "source": source_id,
        "source_category": "community",
        "title": "Test document",
        "url": "https://example.com/doc",
        "reference_url": "https://example.com/doc",
        "published_at": "2026-03-29T00:00:00Z",
        "sort_at": "2026-03-29T00:00:00Z",
        "summary_input_text": "Test document body",
        "text_scope": "body",
        "llm": {"status": "pending"},
        "ranking": {"feed_score": 10},
        "discovery": {"spark_score": 10},
        "engagement": {},
        "metadata": {},
        "tags": [],
        "labels": {},
    }

    store.set(session_key(session_id, "meta"), json.dumps(meta))
    store.set(session_key(session_id, "run_manifest"), json.dumps(run_manifest))
    store.set(session_key(session_id, "source_manifest"), "[]")
    store.set(artifact_root_key(session_id), json.dumps(str(run_dir)))
    store.rpush(feed_key(session_id, source_id), document_id)
    store.set(doc_key(session_id, document_id), json.dumps(document))

    result = run_session_enrichment(
        store,
        session_id,
        generator=StubSummaryGenerator(),
        briefing_generator=FailingBriefingGenerator(),
    )

    llm_state = result["dashboard"]["summary"]["llm"]
    error_report_path = run_dir / "labels" / SESSION_LLM_ERRORS_FILENAME
    error_reports = [
        json.loads(line)
        for line in error_report_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    assert llm_state["status"] == "error"
    assert llm_state["fallbackModeActive"] is True
    assert llm_state["failureCode"] == "SPK-LLM-003"
    assert llm_state["failureReportPath"] == str(error_report_path)
    assert error_reports
    assert {row["error_code"] for row in error_reports} >= {
        "SPK-LLM-003",
        "SPK-LLM-004",
    }
    assert any(
        row["error_code"] == "SPK-LLM-003"
        and row["stage"] == "generating_briefing"
        for row in error_reports
    )


def test_compose_ports_keep_internal_services_local_but_publish_frontend() -> None:
    root = Path(__file__).resolve().parents[1]
    compose_text = (root / "docker-compose.yml").read_text(encoding="utf-8")
    llm_compose_text = (root / "docker-compose.llm.yml").read_text(encoding="utf-8")

    assert (
        '${SPARKORBIT_REDIS_BIND_HOST:-127.0.0.1}:${SPARKORBIT_REDIS_HOST_PORT:-6380}:6379'
        in compose_text
    )
    assert '${SPARKORBIT_BACKEND_BIND_HOST:-127.0.0.1}:8787:8787' in compose_text
    assert '${SPARKORBIT_FRONTEND_BIND_HOST:-0.0.0.0}:3000:80' in compose_text
    assert (
        '${SPARKORBIT_OLLAMA_BIND_HOST:-127.0.0.1}:${SPARKORBIT_OLLAMA_HOST_PORT:-11434}:11434'
        in llm_compose_text
    )


def test_noninteractive_docker_up_defaults_to_llm_off() -> None:
    script_text = (
        Path(__file__).resolve().parents[1] / "scripts" / "docker-up.sh"
    ).read_text(encoding="utf-8")

    assert 'USE_LLM="no"' in script_text
    assert "Non-interactive shell detected; defaulting to LLM OFF." in script_text


def test_create_app_starts_inline_enrichment_worker_for_redis_store(monkeypatch) -> None:
    import backend.app.main as main_module

    class DummyRedisStore(main_module.RedisStore):
        def __init__(self) -> None:
            pass

        def get(self, key: str) -> str | None:
            if key == ACTIVE_SESSION_KEY:
                return "fixture-session"
            return None

        def set(self, key: str, value: str) -> None:
            return None

        def delete(self, *keys: str) -> int:
            return 0

        def expire(self, key: str, seconds: int) -> None:
            return None

        def rpush(self, key: str, *values: str) -> int:
            return 0

        def lrange(self, key: str, start: int, stop: int) -> list[str]:
            return []

        def lpop(self, key: str) -> str | None:
            return None

    started_threads: list[dict[str, object]] = []

    class FakeThread:
        def __init__(self, *, target=None, daemon=None, name=None):
            started_threads.append(
                {
                    "target": target,
                    "daemon": daemon,
                    "name": name,
                    "started": False,
                }
            )

        def start(self) -> None:
            started_threads[-1]["started"] = True

    monkeypatch.delenv("SPARKORBIT_INLINE_ENRICHMENT_WORKER", raising=False)
    monkeypatch.setattr(main_module, "_INLINE_ENRICHMENT_WORKER_STARTED", False)
    monkeypatch.setattr(main_module.threading, "Thread", FakeThread)

    app = main_module.create_app(DummyRedisStore())

    assert app.state.store is not None
    assert started_threads == [
        {
            "target": started_threads[0]["target"],
            "daemon": True,
            "name": "sparkorbit-inline-enrichment",
            "started": True,
        }
    ]
