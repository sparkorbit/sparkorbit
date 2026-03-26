"""Tests for session pipeline helpers in session_service."""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote

from fastapi.testclient import TestClient

# Make backend importable when running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.core.constants import ACTIVE_SESSION_KEY, SUMMARY_EXCLUDED_TEXT_SCOPES
from backend.app.core.store import MemoryStore
from backend.app.main import create_app
from backend.app.services.session_service import (
    build_document_note,
    compact_text,
    digest_key,
    doc_key,
    json_dumps,
    sanitize_document_for_monitor,
    select_summary_candidate_ids,
    session_key,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_document(
    document_id: str = "src:1",
    title: str = "Test",
    text_scope: str = "full_text",
    source_category: str = "papers",
    summary_input_text: str = "Some meaningful text for summary",
    reference_url: str = "https://example.com",
    **overrides,
) -> dict:
    base = {
        "document_id": document_id,
        "title": title,
        "text_scope": text_scope,
        "source_category": source_category,
        "summary_input_text": summary_input_text,
        "reference_url": reference_url,
        "sort_at": "2026-03-25T00:00:00Z",
        "ranking": {"feed_score": 1},
        "discovery": {"spark_score": 0},
        "llm": {"status": "pending"},
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# select_summary_candidate_ids
# ---------------------------------------------------------------------------

class TestSelectSummaryCandidateIds:
    def test_full_text_included(self):
        docs = [_make_document(text_scope="full_text")]
        assert select_summary_candidate_ids(docs) == {"src:1"}

    def test_abstract_included(self):
        docs = [_make_document(text_scope="abstract")]
        assert select_summary_candidate_ids(docs) == {"src:1"}

    def test_excerpt_included(self):
        docs = [_make_document(text_scope="excerpt")]
        assert select_summary_candidate_ids(docs) == {"src:1"}

    def test_empty_excluded(self):
        docs = [_make_document(text_scope="empty")]
        assert select_summary_candidate_ids(docs) == set()

    def test_metadata_only_excluded(self):
        docs = [_make_document(text_scope="metadata_only")]
        assert select_summary_candidate_ids(docs) == set()

    def test_metric_summary_excluded(self):
        docs = [_make_document(text_scope="metric_summary")]
        assert select_summary_candidate_ids(docs) == set()

    def test_generated_panel_excluded(self):
        docs = [_make_document(text_scope="generated_panel")]
        assert select_summary_candidate_ids(docs) == set()

    def test_missing_summary_input_excluded(self):
        docs = [_make_document(summary_input_text="")]
        assert select_summary_candidate_ids(docs) == set()

    def test_missing_title_excluded(self):
        docs = [_make_document(title="")]
        assert select_summary_candidate_ids(docs) == set()

    def test_limit_per_category(self):
        docs = [
            _make_document(document_id=f"src:{i}", source_category="papers")
            for i in range(12)
        ]
        result = select_summary_candidate_ids(docs, limit_per_category=5)
        assert len(result) == 5

    def test_mixed_scopes(self):
        docs = [
            _make_document(document_id="good:1", text_scope="full_text"),
            _make_document(document_id="bad:1", text_scope="metadata_only"),
            _make_document(document_id="good:2", text_scope="abstract"),
            _make_document(document_id="bad:2", text_scope="generated_panel"),
        ]
        result = select_summary_candidate_ids(docs)
        assert result == {"good:1", "good:2"}


# ---------------------------------------------------------------------------
# SUMMARY_EXCLUDED_TEXT_SCOPES constant
# ---------------------------------------------------------------------------

class TestSummaryExcludedTextScopes:
    def test_contains_expected_scopes(self):
        assert "empty" in SUMMARY_EXCLUDED_TEXT_SCOPES
        assert "metadata_only" in SUMMARY_EXCLUDED_TEXT_SCOPES
        assert "metric_summary" in SUMMARY_EXCLUDED_TEXT_SCOPES
        assert "generated_panel" in SUMMARY_EXCLUDED_TEXT_SCOPES

    def test_does_not_exclude_content_scopes(self):
        assert "full_text" not in SUMMARY_EXCLUDED_TEXT_SCOPES
        assert "abstract" not in SUMMARY_EXCLUDED_TEXT_SCOPES
        assert "excerpt" not in SUMMARY_EXCLUDED_TEXT_SCOPES


# ---------------------------------------------------------------------------
# compact_text
# ---------------------------------------------------------------------------

class TestCompactText:
    def test_none_returns_empty(self):
        assert compact_text(None) == ""

    def test_short_text_unchanged(self):
        assert compact_text("hello world", 20) == "hello world"

    def test_long_text_truncated(self):
        result = compact_text("a" * 200, 50)
        assert len(result) == 50
        assert result.endswith("...")

    def test_whitespace_normalized(self):
        assert compact_text("hello   world\n\tfoo") == "hello world foo"


# ---------------------------------------------------------------------------
# build_document_note
# ---------------------------------------------------------------------------

class TestBuildDocumentNote:
    def test_prefers_llm_summary(self):
        doc = _make_document(description="desc", llm={"summary_short": "llm summary"})
        assert build_document_note(doc) == "llm summary"

    def test_falls_back_to_description(self):
        doc = _make_document(description="the description")
        assert build_document_note(doc) == "the description"

    def test_falls_back_to_snippet(self):
        doc = _make_document(
            description=None,
            reference={"snippet": "the snippet"},
        )
        assert build_document_note(doc) == "the snippet"

    def test_strips_arxiv_rss_boilerplate_from_summary(self):
        prefixed = (
            "arXiv:2603.22306v1 Announce Type: new Abstract: "
            "Affective judgment in real interaction is rarely a purely local prediction problem."
        )
        doc = _make_document(
            source="arxiv_rss_cs_ai",
            description=prefixed,
            llm={"summary_short": prefixed},
        )
        assert build_document_note(doc) == (
            "Affective judgment in real interaction is rarely a purely local prediction problem."
        )


class TestSanitizeDocumentForMonitor:
    def test_strips_arxiv_rss_boilerplate_from_document_fields(self):
        prefixed = (
            "arXiv:2603.22306v1 Announce Type: new Abstract: "
            "Affective judgment in real interaction is rarely a purely local prediction problem."
        )
        document = _make_document(
            source="arxiv_rss_cs_ai",
            description=prefixed,
            body_text=prefixed,
            summary_input_text=(
                "Memory Bear AI Memory Science Engine for Multimodal Affective Intelligence: A Technical Report"
                "\n\n"
                + prefixed
            ),
            reference={"snippet": prefixed},
            llm={"summary_short": prefixed, "summary_1l": prefixed},
        )

        sanitized = sanitize_document_for_monitor(document)

        expected = "Affective judgment in real interaction is rarely a purely local prediction problem."
        assert sanitized["description"] == expected
        assert sanitized["body_text"] == expected
        assert sanitized["reference"]["snippet"] == expected
        assert sanitized["llm"]["summary_short"] == expected
        assert sanitized["llm"]["summary_1l"] == expected
        assert sanitized["summary_input_text"].endswith(expected)
        assert "Announce Type:" not in sanitized["summary_input_text"]

    def test_keeps_non_arxiv_documents_unchanged(self):
        document = _make_document(
            source="openai_news_rss",
            description="Regular description",
            body_text="Regular body",
        )

        sanitized = sanitize_document_for_monitor(document)

        assert sanitized == document


class TestDocumentRoute:
    def test_document_route_supports_url_shaped_document_ids(self):
        store = MemoryStore()
        session_id = "session-1"
        document_id = (
            "deepmind_blog:https://deepmind.google/discover/blog/"
            "thinking-into-the-future-latent-lookahead-training-for-transformers"
        )
        document = {
            "document_id": document_id,
            "title": "Thinking into the Future",
            "source": "deepmind_blog",
            "source_category": "company",
            "doc_type": "blog",
        }
        store.set(ACTIVE_SESSION_KEY, session_id)
        store.set(doc_key(session_id, document_id), json_dumps(document))

        client = TestClient(create_app(store))
        response = client.get(f"/api/documents/{quote(document_id, safe='')}?session=active")

        assert response.status_code == 200
        assert response.json()["document_id"] == document_id

    def test_digest_route_supports_path_unsafe_ids(self):
        store = MemoryStore()
        session_id = "session-1"
        digest_id = "company/blogs"
        digest = {
            "id": digest_id,
            "domain": "Company",
            "headline": "Headline",
            "summary": "Summary",
            "evidence": "mixed",
            "document_ids": [],
            "updated_at": "2026-03-25T00:00:00Z",
        }

        store.set(ACTIVE_SESSION_KEY, session_id)
        store.set(session_key(session_id, "meta"), json_dumps({"status": "ready"}))
        store.set(
            session_key(session_id, "run_manifest"),
            json_dumps({"run_id": session_id}),
        )
        store.set(session_key(session_id, "source_manifest"), json_dumps([]))
        store.set(digest_key(session_id, digest_id), json_dumps(digest))

        client = TestClient(create_app(store))
        response = client.get(f"/api/digests/{quote(digest_id, safe='')}?session=active")

        assert response.status_code == 200
        assert response.json()["digest"]["id"] == digest_id
