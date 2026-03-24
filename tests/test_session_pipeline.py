from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.core.constants import (
    ACTIVE_SESSION_KEY,
    BOOTSTRAP_STATE_KEY,
    ORDERED_SOURCE_CATEGORIES,
    QUEUE_SESSION_ENRICH_KEY,
    RELOAD_STATE_KEY,
    RELOAD_STATE_TTL_SECONDS,
    SESSION_TTL_SECONDS,
)
from backend.app.core.store import MemoryStore
from backend.app.services.session_service import (
    document_sort_key,
    get_dashboard_response,
    get_document_response,
    get_json,
    get_or_bootstrap_dashboard_response,
    get_session_reload_response,
    loading_percent,
    publish_run,
    reset_homepage_bootstrap_state,
    reset_session_reload_state,
    run_session_enrichment,
    run_session_reload,
    session_key,
    start_session_reload,
)


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def default_llm_payload() -> dict:
    return {
        "status": "pending",
        "summary_1l": None,
        "summary_short": None,
        "key_points": [],
        "entities": [],
        "primary_domain": None,
        "subdomains": [],
        "importance_score": None,
        "importance_reason": None,
        "evidence_chunk_ids": [],
        "run_meta": {
            "model_name": None,
            "prompt_version": None,
            "fewshot_pack_version": None,
            "generated_at": None,
        },
    }


def make_document(
    *,
    run_id: str,
    document_id: str,
    source: str,
    source_category: str,
    title: str,
    feed_score: float,
    sort_at: str,
    reference_url: str | None = None,
    text_scope: str = "full_text",
    summary_input_text: str | None = None,
) -> dict:
    doc_type_map = {
        "papers": "paper",
        "community": "post",
        "benchmark": "benchmark",
        "company": "blog",
        "company_kr": "blog",
        "company_cn": "blog",
    }
    doc_type = doc_type_map.get(source_category, "blog")
    resolved_reference = reference_url or f"https://example.com/{document_id}"
    description = f"{title} description"
    return {
        "document_id": document_id,
        "run_id": run_id,
        "source": source,
        "source_category": source_category,
        "source_method": "rss",
        "source_endpoint": f"https://example.com/{source}.xml",
        "source_item_id": document_id,
        "doc_type": doc_type,
        "content_type": doc_type,
        "text_scope": text_scope,
        "title": title,
        "description": description,
        "url": resolved_reference if reference_url is not None else None,
        "canonical_url": resolved_reference if reference_url is not None else None,
        "reference_url": reference_url,
        "author": source,
        "authors": [source],
        "published_at": sort_at,
        "updated_at": None,
        "sort_at": sort_at,
        "time_semantics": "published",
        "timestamp_kind": "published",
        "body_text": summary_input_text or f"{title} full body text",
        "summary_input_text": summary_input_text or f"{title} full body text",
        "language": "EN",
        "content_format": "plain_text",
        "external_ids": {},
        "related_urls": [],
        "tags": [source_category],
        "engagement": {"likes": int(feed_score * 10)},
        "engagement_primary": {"name": "likes", "value": int(feed_score * 10)},
        "discovery": {
            "spark_score": round(feed_score / 10, 2),
            "primary_reason": "synthetic-test",
        },
        "ranking": {
            "feed_score": feed_score,
            "priority_reason": "synthetic-test",
        },
        "benchmark": {
            "board_name": "Synthetic Board" if source_category == "benchmark" else None,
            "rank": 1 if source_category == "benchmark" else None,
            "score_value": 95.5 if source_category == "benchmark" else None,
            "score_unit": "%" if source_category == "benchmark" else None,
        },
        "reference": {
            "source_label": source,
            "display_title": title,
            "display_url": resolved_reference if reference_url is not None else None,
            "snippet": description,
        },
        "llm": default_llm_payload(),
        "metadata": {"test_case": "session_pipeline"},
        "raw_ref": {"fetch_id": None, "line_index": None, "response_file": None},
        "fetched_at": sort_at,
    }


def build_base_documents(run_id: str) -> list[dict]:
    return [
        make_document(
            run_id=run_id,
            document_id="company:high",
            source="openai_news_rss",
            source_category="company",
            title="OpenAI launches new model",
            feed_score=98,
            sort_at="2026-03-24T10:00:00Z",
            reference_url="https://openai.com/news/model",
        ),
        make_document(
            run_id=run_id,
            document_id="company:low",
            source="openai_news_rss",
            source_category="company",
            title="OpenAI updates docs",
            feed_score=74,
            sort_at="2026-03-24T08:00:00Z",
            reference_url="https://openai.com/news/docs",
        ),
        make_document(
            run_id=run_id,
            document_id="community:top",
            source="reddit_machinelearning",
            source_category="community",
            title="Community discusses new training trick",
            feed_score=88,
            sort_at="2026-03-24T09:30:00Z",
            reference_url="https://reddit.com/r/MachineLearning/top",
        ),
        make_document(
            run_id=run_id,
            document_id="papers:top",
            source="arxiv_rss_cs_ai",
            source_category="papers",
            title="A fresh paper on agent memory",
            feed_score=92,
            sort_at="2026-03-24T07:15:00Z",
            reference_url="https://arxiv.org/abs/2603.00001",
        ),
        make_document(
            run_id=run_id,
            document_id="company-kr:top",
            source="naver_cloud_blog_rss",
            source_category="company_kr",
            title="Naver Cloud ships new inference stack",
            feed_score=81,
            sort_at="2026-03-24T06:00:00Z",
            reference_url="https://example.com/naver-cloud",
        ),
        make_document(
            run_id=run_id,
            document_id="company-cn:top",
            source="qwen_blog_rss",
            source_category="company_cn",
            title="Qwen shares roadmap update",
            feed_score=79,
            sort_at="2026-03-24T05:00:00Z",
            reference_url="https://example.com/qwen-roadmap",
        ),
        make_document(
            run_id=run_id,
            document_id="benchmark:top",
            source="open_llm_leaderboard",
            source_category="benchmark",
            title="Leaderboard snapshot highlights a new top model",
            feed_score=85,
            sort_at="2026-03-24T04:00:00Z",
            reference_url="https://example.com/leaderboard",
        ),
    ]


def build_run_manifest(run_id: str, sources: list[str]) -> dict:
    return {
        "run_id": run_id,
        "profile": "full",
        "limit": 20,
        "started_at": "2026-03-24T00:00:00Z",
        "finished_at": "2026-03-24T00:01:00Z",
        "git_commit": None,
        "requested_sources": sources,
        "success_count": len(sources),
        "skipped_count": 0,
        "excluded_count": 0,
        "error_count": 0,
    }


def build_source_manifest(sources: list[str]) -> list[dict]:
    return [
        {
            "source": source,
            "endpoint": f"https://example.com/{source}.xml",
            "status": "ok",
            "item_count": 1,
            "normalized_count": 1,
            "metric_count": 0,
            "excluded_document_count": 0,
            "notes": [f"{source} synthetic manifest entry"],
            "duration_ms": 10,
            "raw_response_paths": [],
            "raw_items_path": None,
            "sample_path": None,
        }
        for source in sources
    ]


def create_run_directory(run_id: str, documents: list[dict]) -> Path:
    temp_root = Path(tempfile.mkdtemp(prefix="sparkorbit-session-test-"))
    run_dir = temp_root / run_id
    normalized_dir = run_dir / "normalized"
    normalized_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted({str(document["source"]) for document in documents})
    write_json(run_dir / "run_manifest.json", build_run_manifest(run_id, sources))
    write_ndjson(run_dir / "source_manifest.ndjson", build_source_manifest(sources))
    write_ndjson(normalized_dir / "documents.ndjson", documents)
    write_ndjson(normalized_dir / "metrics.ndjson", [])
    return run_dir


class FailingSummaryGenerator:
    model_name = "failing-test"
    prompt_version = "test"
    fewshot_pack_version = "test"

    def __init__(self) -> None:
        self._failed = False

    def summarize_document(self, document: dict) -> dict:
        if not self._failed:
            self._failed = True
            raise RuntimeError(f"forced summary failure for {document['document_id']}")
        return {
            "status": "complete",
            "summary_1l": document["title"],
            "summary_short": document["title"],
            "key_points": [document["source"]],
            "entities": [],
            "primary_domain": document["source_category"],
            "subdomains": [],
            "importance_score": 42,
            "importance_reason": "test",
            "evidence_chunk_ids": [],
            "run_meta": {
                "model_name": self.model_name,
                "prompt_version": self.prompt_version,
                "fewshot_pack_version": self.fewshot_pack_version,
                "generated_at": "2026-03-24T00:00:00Z",
            },
        }


class SessionPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = MemoryStore()
        self._temp_roots: list[Path] = []
        reset_homepage_bootstrap_state(self.store)
        reset_session_reload_state(self.store)

    def tearDown(self) -> None:
        reset_homepage_bootstrap_state(self.store)
        reset_session_reload_state(self.store)
        for path in self._temp_roots:
            shutil.rmtree(path, ignore_errors=True)

    def _make_run(self, run_id: str, *, documents: list[dict] | None = None) -> Path:
        run_dir = create_run_directory(run_id, documents or build_base_documents(run_id))
        self._temp_roots.append(run_dir.parent)
        return run_dir

    def test_publish_creates_meta_docs_feeds_dashboard_and_active(self) -> None:
        run_dir = self._make_run("2026-03-24T000101Z_publish")
        result = publish_run(self.store, run_dir)
        session_id = result["session_id"]

        self.assertEqual(self.store.get(ACTIVE_SESSION_KEY), session_id)
        self.assertEqual(len(self.store.lists[QUEUE_SESSION_ENRICH_KEY]), 1)

        meta = get_json(self.store, session_key(session_id, "meta"))
        self.assertEqual(meta["status"], "published")
        self.assertTrue(meta["feeds_ready"])
        self.assertFalse(meta["digests_ready"])

        dashboard = get_json(self.store, session_key(session_id, "dashboard"))
        self.assertEqual(dashboard["status"], "published")
        self.assertGreater(len(dashboard["feeds"]), 0)
        self.assertEqual(dashboard["session"]["loading"]["stage"], "published")
        self.assertLess(dashboard["session"]["loading"]["percent"], 100)

        doc_keys = [
            key
            for key in self.store.values
            if key.startswith(f"sparkorbit:session:{session_id}:doc:")
        ]
        self.assertEqual(len(doc_keys), meta["docs_total"])
        self.assertEqual(
            self.store.ttl_for(session_key(session_id, "meta")),
            SESSION_TTL_SECONDS,
        )
        self.assertEqual(
            self.store.ttl_for(session_key(session_id, "dashboard")),
            SESSION_TTL_SECONDS,
        )

    def test_feed_lists_are_sorted_by_feed_score_then_sort_at(self) -> None:
        run_dir = self._make_run("2026-03-24T000102Z_sorted")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]
        meta = get_json(self.store, session_key(session_id, "meta"))

        for source in meta["source_ids"]:
            document_ids = self.store.lrange(
                f"sparkorbit:session:{session_id}:feed:{source}",
                0,
                -1,
            )
            documents = [
                get_document_response(self.store, document_id, session=session_id)
                for document_id in document_ids
            ]
            self.assertEqual(
                [document["document_id"] for document in documents],
                [
                    document["document_id"]
                    for document in sorted(
                        documents,
                        key=document_sort_key,
                        reverse=True,
                    )
                ],
            )

    def test_publish_filters_url_less_documents(self) -> None:
        run_id = "2026-03-24T111111Z_no_url"
        documents = build_base_documents(run_id) + [
            make_document(
                run_id=run_id,
                document_id="synthetic:no-url",
                source="openai_news_rss",
                source_category="company",
                title="Should not be published",
                feed_score=99,
                sort_at="2026-03-24T11:11:11Z",
                reference_url=None,
            )
        ]
        documents[-1]["url"] = None
        documents[-1]["canonical_url"] = None
        documents[-1]["reference"]["display_url"] = None

        run_dir = self._make_run(run_id, documents=documents)
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]

        self.assertIsNone(
            self.store.get(f"sparkorbit:session:{session_id}:doc:synthetic:no-url"),
        )
        dashboard = get_dashboard_response(self.store, session_id)
        self.assertFalse(
            any(
                item["documentId"] == "synthetic:no-url"
                for feed in dashboard["feeds"]
                for item in feed["items"]
            ),
        )

    def test_enrichment_creates_category_digests_and_updates_status(self) -> None:
        run_dir = self._make_run("2026-03-24T000103Z_enrich")
        result = publish_run(self.store, run_dir)
        session_id = result["session_id"]

        summary_result = run_session_enrichment(self.store, session_id)
        meta = summary_result["meta"]

        self.assertEqual(meta["status"], "ready")
        self.assertTrue(meta["digests_ready"])
        self.assertGreater(meta["summaries_ready"], 0)

        for category in ORDERED_SOURCE_CATEGORIES:
            digest = get_json(
                self.store,
                f"sparkorbit:session:{session_id}:digest:{category}",
            )
            self.assertIsNotNone(digest)

        dashboard = get_dashboard_response(self.store, session_id)
        self.assertEqual(dashboard["status"], "ready")
        self.assertEqual(dashboard["session"]["loading"]["stage"], "ready")
        self.assertEqual(dashboard["session"]["loading"]["percent"], 100)

    def test_partial_error_keeps_dashboard_usable(self) -> None:
        run_dir = self._make_run("2026-03-24T000104Z_partial")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]

        summary_result = run_session_enrichment(
            self.store,
            session_id,
            generator=FailingSummaryGenerator(),
        )

        self.assertEqual(summary_result["meta"]["status"], "partial_error")
        dashboard = get_dashboard_response(self.store, session_id)
        self.assertEqual(dashboard["status"], "partial_error")

        errored_documents = [
            json.loads(value)
            for key, value in self.store.values.items()
            if key.startswith(f"sparkorbit:session:{session_id}:doc:")
            and json.loads(value).get("llm", {}).get("status") == "error"
        ]
        self.assertGreaterEqual(len(errored_documents), 1)

    def test_session_rollover_updates_active_without_deleting_previous_session(self) -> None:
        first_run_dir = self._make_run("2026-03-24T010101Z_first")
        second_run_dir = self._make_run("2026-03-24T020202Z_second")

        first = publish_run(self.store, first_run_dir, queue=False)
        second = publish_run(self.store, second_run_dir, queue=False)

        self.assertEqual(self.store.get(ACTIVE_SESSION_KEY), second["session_id"])
        self.assertIsNotNone(
            self.store.get(session_key(first["session_id"], "dashboard")),
        )
        self.assertIsNotNone(
            self.store.get(session_key(second["session_id"], "dashboard")),
        )

    def test_dashboard_rebuilds_when_materialized_key_is_missing(self) -> None:
        run_dir = self._make_run("2026-03-24T000105Z_rebuild")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]

        self.store.delete(session_key(session_id, "dashboard"))
        rebuilt = get_dashboard_response(self.store, session_id)

        self.assertEqual(rebuilt["session"]["sessionId"], session_id)
        self.assertIsNotNone(
            self.store.get(session_key(session_id, "dashboard")),
        )

    def test_homepage_dashboard_bootstraps_collection_when_active_session_is_missing(self) -> None:
        scheduled: list[str] = []

        dashboard = get_or_bootstrap_dashboard_response(
            self.store,
            schedule_bootstrap=lambda: scheduled.append("queued"),
        )
        second_dashboard = get_or_bootstrap_dashboard_response(
            self.store,
            schedule_bootstrap=lambda: scheduled.append("queued-again"),
        )

        self.assertEqual(dashboard["status"], "collecting")
        self.assertEqual(second_dashboard["status"], "collecting")
        self.assertEqual(scheduled, ["queued"])
        self.assertEqual(dashboard["session"]["loading"]["stage"], "starting")

        bootstrap_state = get_json(self.store, BOOTSTRAP_STATE_KEY)
        self.assertIsNotNone(bootstrap_state)
        self.assertEqual(bootstrap_state["status"], "collecting")

    def test_loading_percent_tracks_overall_pipeline_without_resetting_to_zero(self) -> None:
        fetching_mid = loading_percent(
            3,
            10,
            status="collecting",
            stage="fetching_sources",
        )
        published = loading_percent(
            1,
            1,
            status="published",
            stage="published",
        )
        summarizing_start = loading_percent(
            0,
            8,
            status="summarizing",
            stage="summarizing_documents",
        )
        digests_mid = loading_percent(
            3,
            6,
            status="summarizing",
            stage="building_digests",
        )
        ready = loading_percent(
            6,
            6,
            status="ready",
            stage="ready",
        )

        self.assertGreater(fetching_mid, 0)
        self.assertLess(fetching_mid, published)
        self.assertLess(published, 100)
        self.assertGreaterEqual(summarizing_start, published)
        self.assertLess(summarizing_start, digests_mid)
        self.assertEqual(ready, 100)

    def test_session_reload_state_tracks_real_progress_until_ready(self) -> None:
        run_id = "2026-03-24T030303Z_reload"
        run_dir = self._make_run(run_id)
        run_manifest = json.loads((run_dir / "run_manifest.json").read_text(encoding="utf-8"))
        snapshots: list[dict] = []

        def fake_collect_run(**kwargs):
            progress_callback = kwargs.get("progress_callback")
            if progress_callback:
                progress_callback(
                    {
                        "stage": "starting",
                        "run_id": run_id,
                        "total_sources": 3,
                        "completed_sources": 0,
                        "current_source": None,
                        "detail": "Preparing 3 source(s) for collection.",
                    }
                )
                progress_callback(
                    {
                        "stage": "fetching_sources",
                        "run_id": run_id,
                        "total_sources": 3,
                        "completed_sources": 1,
                        "current_source": "openai_news_rss",
                        "detail": "Completed openai_news_rss with status ok.",
                    }
                )
                snapshots.append(get_session_reload_response(self.store))
                progress_callback(
                    {
                        "stage": "fetching_sources",
                        "run_id": run_id,
                        "total_sources": 3,
                        "completed_sources": 3,
                        "current_source": "arxiv_rss_cs_ai",
                        "detail": "Completed arxiv_rss_cs_ai with status ok.",
                    }
                )
                snapshots.append(get_session_reload_response(self.store))
            return run_manifest, run_dir

        start_response = start_session_reload(
            self.store,
            schedule_reload=lambda: None,
            profile="full",
            run_label="redis-session",
        )
        self.assertEqual(start_response["status"], "collecting")
        self.assertEqual(start_response["loading"]["stage"], "starting")

        with patch(
            "backend.app.services.session_service.collect_run",
            side_effect=fake_collect_run,
        ):
            run_session_reload(
                self.store,
                profile="full",
                run_label="redis-session",
            )

        final_response = get_session_reload_response(self.store)
        self.assertEqual(final_response["status"], "ready")
        self.assertEqual(final_response["session_id"], run_id)
        self.assertEqual(final_response["loading"]["stage"], "ready")
        self.assertEqual(final_response["loading"]["percent"], 100)
        self.assertEqual(self.store.ttl_for(RELOAD_STATE_KEY), RELOAD_STATE_TTL_SECONDS)
        self.assertEqual(len(snapshots), 2)
        self.assertLess(snapshots[0]["loading"]["percent"], snapshots[1]["loading"]["percent"])
        self.assertLess(snapshots[1]["loading"]["percent"], 100)


if __name__ == "__main__":
    unittest.main()
