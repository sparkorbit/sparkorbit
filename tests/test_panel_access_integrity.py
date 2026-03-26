"""End-to-end integrity checks for dashboard panel access."""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote, urlparse

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


def test_dashboard_feed_items_open_document_routes(dashboard_client: TestClient) -> None:
    response = dashboard_client.get("/api/dashboard?session=active")
    assert response.status_code == 200
    dashboard = response.json()

    for feed in dashboard["feeds"]:
        for item in feed["items"]:
            parsed = urlparse(item["referenceUrl"])
            assert parsed.scheme in {"http", "https"}
            assert parsed.netloc

            encoded_document_id = quote(item["documentId"], safe="")
            document_response = dashboard_client.get(
                f"/api/documents/{encoded_document_id}?session=active"
            )
            assert document_response.status_code == 200, (
                feed["id"],
                item["documentId"],
            )


def test_dashboard_digests_open_related_documents(dashboard_client: TestClient) -> None:
    response = dashboard_client.get("/api/dashboard?session=active")
    assert response.status_code == 200
    dashboard = response.json()

    for digest in dashboard["summary"]["digests"]:
        encoded_digest_id = quote(digest["id"], safe="")
        digest_response = dashboard_client.get(
            f"/api/digests/{encoded_digest_id}?session=active"
        )
        assert digest_response.status_code == 200, digest["id"]

        payload = digest_response.json()
        assert len(payload["digest"]["documentIds"]) == len(payload["documents"])
        for document in payload["documents"]:
            encoded_document_id = quote(document["document_id"], safe="")
            document_response = dashboard_client.get(
                f"/api/documents/{encoded_document_id}?session=active"
            )
            assert document_response.status_code == 200, (
                digest["id"],
                document["document_id"],
            )
