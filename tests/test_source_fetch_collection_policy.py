"""Tests for source-specific collection defaults and recency policy."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Make source_fetch importable when running from repo root.
sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1] / "pipelines" / "source_fetch" / "scripts"),
)
sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1] / "pipelines" / "llm_enrich" / "scripts"),
)

from llm_enrich import company_candidates
from source_fetch.adapters import resolve_sources
from source_fetch.models import SourceConfig
from source_fetch.pipeline import apply_source_collection_policy, effective_limit


def test_model_registry_keeps_trending_and_new_only() -> None:
    sources = {source.name: source for source in resolve_sources(["all"])}

    assert "hf_trending_models" in sources
    assert "hf_models_new" in sources
    assert "hf_models_likes" not in sources


def test_source_specific_default_limits_are_exposed() -> None:
    sources = {source.name: source for source in resolve_sources(["all"])}

    assert effective_limit(sources["arxiv_rss_cs_ai"], None) == 16
    assert effective_limit(sources["hf_daily_papers"], None) == 16
    assert effective_limit(sources["hn_topstories"], None) == 10
    assert effective_limit(sources["github_curated_repos"], None) == 10
    assert effective_limit(sources["arxiv_rss_cs_ai"], 3) == 3


def test_company_source_policy_filters_old_documents_and_metrics() -> None:
    source = SourceConfig(
        name="test_company_feed",
        category="company",
        method="rss",
        endpoint="https://example.com/feed.xml",
        doc_type="blog",
        parser="rss",
        max_age_days=90,
    )
    now = datetime.now(timezone.utc)
    recent_time = (now - timedelta(days=14)).isoformat().replace("+00:00", "Z")
    old_time = (now - timedelta(days=120)).isoformat().replace("+00:00", "Z")

    documents = [
        {"source_item_id": "recent-item", "sort_at": recent_time, "published_at": recent_time},
        {"source_item_id": "old-item", "sort_at": old_time, "published_at": old_time},
    ]
    metrics = [
        {"source_item_id": "recent-item", "metric_name": "likes"},
        {"source_item_id": "old-item", "metric_name": "likes"},
    ]

    kept_documents, kept_metrics, excluded_count = apply_source_collection_policy(
        source,
        documents,
        metrics,
    )

    assert excluded_count == 1
    assert [document["source_item_id"] for document in kept_documents] == ["recent-item"]
    assert [metric["source_item_id"] for metric in kept_metrics] == ["recent-item"]


def test_company_llm_candidates_exclude_kr_and_cn_categories() -> None:
    documents = [
        {
            "document_id": "company-doc",
            "source": "anthropic_news",
            "source_category": "company",
            "text_scope": "body",
            "sort_at": "2026-03-26T00:00:00Z",
            "published_at": "2026-03-26T00:00:00Z",
            "title": "Main company update",
        },
        {
            "document_id": "kr-doc",
            "source": "wrtn_blog",
            "source_category": "company_kr",
            "text_scope": "body",
            "sort_at": "2026-03-26T00:00:00Z",
            "published_at": "2026-03-26T00:00:00Z",
            "title": "KR company update",
        },
        {
            "document_id": "cn-doc",
            "source": "github_qwen",
            "source_category": "company_cn",
            "text_scope": "body",
            "sort_at": "2026-03-26T00:00:00Z",
            "published_at": "2026-03-26T00:00:00Z",
            "title": "CN company update",
        },
        {
            "document_id": "hf-blog-doc",
            "source": "hf_blog",
            "source_category": "community",
            "text_scope": "body",
            "sort_at": "2026-03-26T00:00:00Z",
            "published_at": "2026-03-26T00:00:00Z",
            "title": "HF blog update",
        },
    ]

    candidates = company_candidates(documents, per_source=8, max_age_days=None)

    assert [document["document_id"] for document in candidates] == [
        "company-doc",
        "hf-blog-doc",
    ]
