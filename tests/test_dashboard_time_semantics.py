"""Regression tests for dashboard display-time semantics."""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

# Make backend importable when running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.core.store import MemoryStore
from backend.app.main import create_app
from backend.app.services.session_service import publish_run


RUN_DIR = (
    Path(__file__).resolve().parents[1]
    / "pipelines"
    / "source_fetch"
    / "data"
    / "runs"
    / "2026-03-25T150713Z_data-test"
)


@pytest.fixture
def dashboard_client() -> TestClient:
    if not RUN_DIR.exists():
        pytest.skip(f"Run artifact not found: {RUN_DIR}")

    store = MemoryStore()
    publish_run(store, RUN_DIR, queue=False)
    return TestClient(create_app(store))


def _fetch_document(client: TestClient, document_id: str) -> dict:
    response = client.get(f"/api/documents/{quote(document_id, safe='')}?session=active")
    assert response.status_code == 200, document_id
    return response.json()


def test_feed_timestamps_match_document_display_time(
    dashboard_client: TestClient,
) -> None:
    response = dashboard_client.get("/api/dashboard?session=active")
    assert response.status_code == 200
    dashboard = response.json()

    failures: list[str] = []
    expected_labels = {
        "published": "Published",
        "updated": "Updated",
        "created": "Created",
        "submission": "Submitted",
        "snapshot": "Snapshot",
    }

    for feed in dashboard.get("feeds", []):
        for item in feed.get("items", []):
            document = _fetch_document(dashboard_client, item["documentId"])
            display_time = document.get("display_time") or {}
            semantics = str(
                display_time.get("semantics") or document.get("time_semantics") or ""
            ).strip()

            if item.get("timestamp") != display_time.get("value"):
                failures.append(
                    f"{item['documentId']} feed timestamp mismatch: "
                    f"{item.get('timestamp')} != {display_time.get('value')}"
                )
            if item.get("timestampLabel") != display_time.get("label"):
                failures.append(
                    f"{item['documentId']} feed timestamp label mismatch: "
                    f"{item.get('timestampLabel')} != {display_time.get('label')}"
                )
            expected_label = expected_labels.get(semantics)
            if expected_label and display_time.get("label") != expected_label:
                failures.append(
                    f"{item['documentId']} semantics {semantics} expected "
                    f"{expected_label}, got {display_time.get('label')}"
                )
            if semantics == "updated" and display_time.get("field") == "published_at":
                failures.append(
                    f"{item['documentId']} uses published_at for updated semantics"
                )

    assert not failures, "\n".join(failures)


def test_hf_trending_model_uses_updated_not_published_time(
    dashboard_client: TestClient,
) -> None:
    document = _fetch_document(
        dashboard_client,
        "hf_trending_models:Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled",
    )
    display_time = document.get("display_time") or {}

    assert document.get("source") == "hf_trending_models"
    assert document.get("time_semantics") == "updated"
    assert document.get("published_at") is None
    assert display_time.get("label") == "Updated"
    assert display_time.get("field") == "updated_at"
    assert display_time.get("value") == document.get("updated_at")
