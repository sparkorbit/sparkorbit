"""Regression tests for dashboard feed/detail access paths."""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote

from fastapi.testclient import TestClient

# Make backend importable when running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.core.store import MemoryStore
from backend.app.main import create_app
from backend.app.services.session_service import publish_run


RUN_FIXTURE_DIR = (
    Path(__file__).resolve().parents[1]
    / "pipelines"
    / "source_fetch"
    / "data"
    / "runs"
    / "2026-03-25T150713Z_data-test"
)
SECOND_RUN_FIXTURE_DIR = (
    Path(__file__).resolve().parents[1]
    / "pipelines"
    / "source_fetch"
    / "data"
    / "runs"
    / "2026-03-25T175100Z_cleanup-check"
)


def build_client() -> TestClient:
    store = MemoryStore()
    publish_run(store, RUN_FIXTURE_DIR, queue=False)
    return TestClient(create_app(store))


def test_all_dashboard_feed_items_and_digests_resolve() -> None:
    client = build_client()
    dashboard_response = client.get("/api/dashboard?session=active")
    assert dashboard_response.status_code == 200

    dashboard = dashboard_response.json()
    failures: list[str] = []

    for feed in dashboard.get("feeds", []):
        for item in feed.get("items", []):
            document_id = str(item.get("documentId") or "")
            response = client.get(
                f"/api/documents/{quote(document_id, safe='')}?session=active"
            )
            if response.status_code != 200:
                failures.append(
                    f"feed {feed.get('id')} document {document_id} -> {response.status_code}"
                )
                continue
            document = response.json()
            if not (
                document.get("reference_url")
                or document.get("canonical_url")
                or document.get("url")
            ):
                failures.append(
                    f"feed {feed.get('id')} document {document_id} missing displayable URL"
                )

    for digest in dashboard.get("summary", {}).get("digests", []):
        digest_id = str(digest.get("id") or "")
        response = client.get(
            f"/api/digests/{quote(digest_id, safe='')}?session=active"
        )
        if response.status_code != 200:
            failures.append(f"digest {digest_id} -> {response.status_code}")
            continue
        payload = response.json()
        for document_id in payload.get("digest", {}).get("documentIds", []):
            document_response = client.get(
                f"/api/documents/{quote(document_id, safe='')}?session=active"
            )
            if document_response.status_code != 200:
                failures.append(
                    f"digest {digest_id} document {document_id} -> {document_response.status_code}"
                )

    assert not failures, "\n".join(failures)


def test_document_detail_must_use_visible_dashboard_session() -> None:
    store = MemoryStore()
    publish_run(store, RUN_FIXTURE_DIR, queue=False)
    publish_run(store, SECOND_RUN_FIXTURE_DIR, queue=False)
    client = TestClient(create_app(store))

    first_dashboard = client.get(
        f"/api/dashboard?session={quote(RUN_FIXTURE_DIR.name, safe='')}"
    )
    assert first_dashboard.status_code == 200
    first_payload = first_dashboard.json()
    first_document_id = first_payload["feeds"][0]["items"][0]["documentId"]
    session_id = first_payload["session"]["sessionId"]

    active_response = client.get(
        f"/api/documents/{quote(first_document_id, safe='')}?session=active"
    )
    pinned_response = client.get(
        f"/api/documents/{quote(first_document_id, safe='')}?session={quote(session_id, safe='')}"
    )

    assert active_response.status_code == 404
    assert pinned_response.status_code == 200
    assert pinned_response.json()["document_id"] == first_document_id
