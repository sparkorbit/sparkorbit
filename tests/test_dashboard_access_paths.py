"""Regression tests for dashboard feed/detail access paths."""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote

from fastapi.testclient import TestClient
import pytest

# Make backend importable when running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.core.store import MemoryStore
from backend.app.main import create_app
from backend.app.services.session_service import (
    build_briefing_input,
    build_visible_feed_documents,
    get_documents_by_id,
    get_json,
    get_feed_lists,
    publish_run,
    rebuild_dashboard,
    rebuild_session_category_digests,
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
SECOND_RUN_FIXTURE_DIR = (
    Path(__file__).resolve().parents[1]
    / "pipelines"
    / "source_fetch"
    / "data"
    / "runs"
    / "2026-03-25T175100Z_cleanup-check"
)


def require_run_fixture(path: Path) -> Path:
    if not path.exists():
        pytest.skip(f"Run artifact not found: {path}")
    return path


def build_client() -> TestClient:
    store = MemoryStore()
    publish_run(store, require_run_fixture(RUN_FIXTURE_DIR), queue=False)
    return TestClient(create_app(store))


def test_all_dashboard_feed_items_and_digests_resolve() -> None:
    client = build_client()
    dashboard_response = client.get("/api/dashboard?session=active")
    assert dashboard_response.status_code == 200

    dashboard = dashboard_response.json()
    assert dashboard.get("summary", {}).get("title") == "Today in AI"
    assert dashboard.get("summary", {}).get("llm", {}).get("status") == "disabled"
    assert dashboard.get("summary", {}).get("llm", {}).get("enabled") is False
    assert dashboard.get("summary", {}).get("paperDomains") == []
    assert isinstance(dashboard.get("summary", {}).get("sourceCounts"), list)
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
    publish_run(store, require_run_fixture(RUN_FIXTURE_DIR), queue=False)
    publish_run(store, require_run_fixture(SECOND_RUN_FIXTURE_DIR), queue=False)
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


def test_community_feeds_expose_and_sort_by_feed_score() -> None:
    client = build_client()
    dashboard_response = client.get("/api/dashboard?session=active")
    assert dashboard_response.status_code == 200

    dashboard = dashboard_response.json()
    community_feeds = [
        feed for feed in dashboard.get("feeds", []) if feed.get("eyebrow") == "Community"
    ]

    assert community_feeds, "expected at least one community feed"

    for feed in community_feeds:
        scores = []
        for item in feed.get("items", []):
            assert "feedScore" in item, f"community item missing feedScore in {feed.get('id')}"
            score = item.get("feedScore")
            scores.append(float(score or 0))
        assert scores == sorted(scores, reverse=True), (
            feed.get("id"),
            scores,
        )


def test_company_feed_display_ignores_company_labels_and_keeps_all_items() -> None:
    documents = [
        {
            "document_id": "drop-doc",
            "source": "company_feed",
            "source_category": "company",
            "title": "Recruiting Update",
            "sort_at": "2026-03-26T08:00:00Z",
            "ranking": {"feed_score": 90},
            "labels": {"company": {"decision": "drop"}},
        },
        {
            "document_id": "keep-doc",
            "source": "company_feed",
            "source_category": "company",
            "title": "New model release",
            "sort_at": "2026-03-26T07:00:00Z",
            "ranking": {"feed_score": 80},
            "labels": {"company": {"decision": "keep"}},
        },
        {
            "document_id": "unlabeled-doc",
            "source": "company_feed",
            "source_category": "company",
            "title": "API update",
            "sort_at": "2026-03-26T09:00:00Z",
            "ranking": {"feed_score": 100},
            "labels": {},
        },
    ]

    visible = build_visible_feed_documents(documents, source="company_feed")

    assert [document["document_id"] for document in visible] == [
        "unlabeled-doc",
        "drop-doc",
        "keep-doc",
    ]


def test_briefing_input_skips_company_filtering_outputs() -> None:
    documents_by_id = {
        "paper-doc": {
            "document_id": "paper-doc",
            "source": "arxiv_rss_cs_ai",
            "source_category": "papers",
            "title": "Paper title",
            "published_at": "2026-03-26T08:00:00Z",
            "sort_at": "2026-03-26T08:00:00Z",
            "labels": {"paper_domain": "agents"},
        },
        "company-doc": {
            "document_id": "company-doc",
            "source": "deepmind_blog",
            "source_category": "company",
            "title": "Company title",
            "published_at": "2026-03-26T08:00:00Z",
            "sort_at": "2026-03-26T08:00:00Z",
            "labels": {
                "company": {
                    "decision": "keep",
                    "company_domain": "technical_research",
                }
            },
        },
    }
    feed_lists = {
        "arxiv_rss_cs_ai": ["paper-doc"],
        "deepmind_blog": ["company-doc"],
    }

    briefing_input = build_briefing_input(documents_by_id, feed_lists)

    assert briefing_input["company"] == []
    assert briefing_input["session"]["category_counts"]["company"] == 0
    assert briefing_input["session"]["dominant_company_domains"] == []
    assert briefing_input["session"]["company_issue_domains"] == []
    assert briefing_input["session"]["company_filtering_enabled"] is False


def test_briefing_input_keeps_paper_source_mix_with_fifteen_item_cap() -> None:
    documents_by_id = {}
    feed_lists = {
        "arxiv_rss_cs_ai": [],
        "hf_daily_papers": [],
        "custom_papers_feed": [],
    }

    for index in range(12):
        document_id = f"arxiv-{index}"
        documents_by_id[document_id] = {
            "document_id": document_id,
            "source": "arxiv_rss_cs_ai",
            "source_category": "papers",
            "title": f"ArXiv paper {index}",
            "published_at": f"2099-01-01T0{index}:00:00Z",
            "sort_at": f"2099-01-01T0{index}:00:00Z",
            "labels": {"paper_domain": "agents"},
        }
        feed_lists["arxiv_rss_cs_ai"].append(document_id)

    for index in range(4):
        document_id = f"hf-{index}"
        documents_by_id[document_id] = {
            "document_id": document_id,
            "source": "hf_daily_papers",
            "source_category": "papers",
            "title": f"HF paper {index}",
            "published_at": f"2099-01-01T1{index}:00:00Z",
            "sort_at": f"2099-01-01T1{index}:00:00Z",
            "labels": {"paper_domain": "reasoning"},
        }
        feed_lists["hf_daily_papers"].append(document_id)

    for index in range(4):
        document_id = f"other-{index}"
        documents_by_id[document_id] = {
            "document_id": document_id,
            "source": "custom_papers_feed",
            "source_category": "papers",
            "title": f"Other paper {index}",
            "published_at": f"2099-01-01T2{index}:00:00Z",
            "sort_at": f"2099-01-01T2{index}:00:00Z",
            "labels": {"paper_domain": "vision"},
        }
        feed_lists["custom_papers_feed"].append(document_id)

    briefing_input = build_briefing_input(documents_by_id, feed_lists)

    assert len(briefing_input["papers"]) == 15
    assert Counter(item["source_group"] for item in briefing_input["papers"]) == {
        "arxiv": 10,
        "hf_daily": 3,
        "other": 2,
    }


def test_briefing_input_keeps_trending_model_lane_with_five_item_cap() -> None:
    documents_by_id = {}
    feed_lists = {
        "hf_trending_models": [],
    }

    for index in range(10):
        document_id = f"trending-{index}"
        documents_by_id[document_id] = {
            "document_id": document_id,
            "source": "hf_trending_models",
            "source_category": "models",
            "title": f"Trending model {index}",
            "published_at": f"2099-01-02T0{index}:00:00Z",
            "sort_at": f"2099-01-02T0{index}:00:00Z",
            "ranking": {"feed_score": 1000 - index, "priority_reason": "hot_now"},
            "engagement_primary": {"value": 100 - index},
            "engagement": {"likes": 100 - index, "downloads": 0},
            "discovery": {
                "primary_reason": "trending_feed",
                "freshness_bucket": "active",
            },
            "metadata": {"trending_position": index + 1},
        }
        feed_lists["hf_trending_models"].append(document_id)

    briefing_input = build_briefing_input(documents_by_id, feed_lists)

    assert len(briefing_input["models"]) == 5
    assert Counter(item["source"] for item in briefing_input["models"]) == {
        "hf_trending_models": 5,
    }


def test_briefing_input_keeps_community_focus_with_hf_signals_at_five_item_cap() -> None:
    documents_by_id = {}
    feed_lists = {
        "hn_topstories": [],
        "hf_daily_papers": [],
        "hf_trending_models": [],
    }

    for index in range(5):
        document_id = f"community-{index}"
        documents_by_id[document_id] = {
            "document_id": document_id,
            "source": "hn_topstories",
            "source_category": "community",
            "title": f"Community topic {index}",
            "published_at": f"2099-01-03T0{index}:00:00Z",
            "sort_at": f"2099-01-03T0{index}:00:00Z",
            "ranking": {"feed_score": 100 - index},
        }
        feed_lists["hn_topstories"].append(document_id)

    for source, suffix in (
        ("hf_daily_papers", "daily"),
        ("hf_trending_models", "trend"),
    ):
        document_id = f"hf-{suffix}"
        documents_by_id[document_id] = {
            "document_id": document_id,
            "source": source,
            "source_category": "models" if source != "hf_daily_papers" else "papers",
            "title": f"HF signal {suffix}",
            "published_at": "2099-01-03T10:00:00Z",
            "sort_at": "2099-01-03T10:00:00Z",
            "ranking": {"feed_score": 500},
        }
        feed_lists[source].append(document_id)

    briefing_input = build_briefing_input(documents_by_id, feed_lists)

    assert len(briefing_input["community"]) == 5
    assert Counter(item["source"] for item in briefing_input["community"]) == {
        "hn_topstories": 3,
        "hf_daily_papers": 1,
        "hf_trending_models": 1,
    }


def test_rebuilt_category_digests_reflect_labeled_paper_domains() -> None:
    store = MemoryStore()
    publish_run(store, require_run_fixture(RUN_FIXTURE_DIR), queue=False)
    session_id = RUN_FIXTURE_DIR.name
    meta = get_json(store, session_key(session_id, "meta"))
    assert isinstance(meta, dict)

    feed_lists = get_feed_lists(store, session_id, meta.get("source_ids") or [])
    documents_by_id = get_documents_by_id(store, session_id, feed_lists)
    digests = rebuild_session_category_digests(store, session_id, documents_by_id, feed_lists)

    paper_digest = digests["papers"]
    assert paper_digest["headline"].startswith("Today's Papers: ")
    assert paper_digest["headline"] != "Today's Papers: Not grouped by domain yet"

    dashboard = rebuild_dashboard(store, session_id)
    dashboard_paper_digest = next(
        digest
        for digest in dashboard.get("summary", {}).get("digests", [])
        if digest.get("id") == "papers"
    )
    assert dashboard_paper_digest["headline"] == paper_digest["headline"]
