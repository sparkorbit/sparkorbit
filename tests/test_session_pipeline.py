from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.core.constants import (
    ACTIVE_SESSION_KEY,
    ORDERED_SOURCE_CATEGORIES,
    QUEUE_SESSION_ENRICH_KEY,
    RECENT_SESSIONS_KEY,
    SCHEMA_VERSION,
    SESSION_RETAIN_COUNT,
    SESSION_TTL_SECONDS,
)
from backend.app.core.store import MemoryStore
from backend.app.services.job_progress import get_or_create_job_tracker
from backend.app.services.session_service import (
    build_briefing_input,
    document_sort_key,
    get_active_job_response,
    get_dashboard_response,
    get_document_response,
    get_job_progress_response,
    get_json,
    get_leaderboard_response,
    publish_run,
    run_session_enrichment,
    run_session_reload,
    set_homepage_bootstrap_running,
    set_session_reload_running,
    session_key,
    start_session_reload,
)
from backend.app.services.summary_provider import (
    _build_models_section,
    _build_today_intro,
    build_summary_generator,
)


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def read_ndjson_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


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
    metadata: dict | None = None,
    benchmark: dict | None = None,
    doc_type_override: str | None = None,
) -> dict:
    doc_type_map = {
        "papers": "paper",
        "models": "model",
        "community": "post",
        "benchmark": "benchmark",
        "company": "blog",
        "company_kr": "blog",
        "company_cn": "blog",
    }
    doc_type = doc_type_override or doc_type_map.get(source_category, "blog")
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
            **(benchmark or {}),
        },
        "reference": {
            "source_label": source,
            "display_title": title,
            "display_url": resolved_reference if reference_url is not None else None,
            "snippet": description,
        },
        "llm": default_llm_payload(),
        "metadata": {"test_case": "session_pipeline", **(metadata or {})},
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
            document_id="models:top",
            source="hf_models_new",
            source_category="models",
            title="A freshly released multimodal model card",
            feed_score=90,
            sort_at="2026-03-24T07:45:00Z",
            reference_url="https://huggingface.co/example/model",
            metadata={"pipeline_tag": "image-text-to-text"},
            doc_type_override="model",
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


class StaticBriefingGenerator:
    def __init__(self) -> None:
        self.closed = False

    def generate_briefing(self, briefing_input: dict) -> dict:
        return {
            "body_en": (
                f"[Papers] {briefing_input['date']} papers are clustering around a few visible themes. "
                "[Company News] Signals aligned."
            ),
            "category_summaries": {},
            "error": None,
            "run_meta": {
                "model_name": "briefing-test",
                "prompt_version": "briefing_mapreduce_v8",
                "generated_at": "2026-03-24T00:00:00Z",
            },
        }

    def close(self) -> None:
        self.closed = True


class SessionPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = MemoryStore()
        self._temp_roots: list[Path] = []
        set_homepage_bootstrap_running(False)
        set_session_reload_running(False)

    def tearDown(self) -> None:
        set_homepage_bootstrap_running(False)
        set_session_reload_running(False)
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
        self.assertEqual(dashboard["session"]["loading"]["stage"], "publishing_views")
        self.assertEqual(dashboard["session"]["loading"]["percent"], 88)

    def test_job_progress_tracker_tracks_parallel_sources_and_terminal_state(
        self,
    ) -> None:
        tracker = get_or_create_job_tracker(
            self.store,
            job_id="job_parallel_sources",
            surface="dashboard",
            job_type="collection_reload",
        )

        tracker.handle_event(
            {
                "type": "stage",
                "stage": "fetching_sources",
                "detail": "Fetching sources.",
                "progress_current": 0,
                "progress_total": 3,
                "force": True,
            }
        )
        tracker.handle_event(
            {
                "type": "source_started",
                "source": "openai_news_rss",
                "label": "openai_news_rss",
                "total": 3,
            }
        )
        tracker.handle_event(
            {
                "type": "source_started",
                "source": "reddit_machinelearning",
                "label": "reddit_machinelearning",
                "total": 3,
            }
        )
        tracker.handle_event(
            {
                "type": "source_finished",
                "source": "reddit_machinelearning",
                "label": "reddit_machinelearning",
                "status": "ok",
            }
        )
        tracker.handle_event(
            {
                "type": "source_started",
                "source": "hf_models_new",
                "label": "hf_models_new",
                "total": 3,
            }
        )
        tracker.handle_event(
            {
                "type": "source_finished",
                "source": "openai_news_rss",
                "label": "openai_news_rss",
                "status": "error",
            }
        )
        tracker.handle_event(
            {
                "type": "source_finished",
                "source": "hf_models_new",
                "label": "hf_models_new",
                "status": "skipped",
            }
        )
        tracker.handle_event(
            {
                "type": "terminal",
                "status": "partial_error",
                "detail": "Collection finished with partial summary errors.",
                "step_id": "summaries",
            }
        )

        payload = get_job_progress_response(
            self.store,
            job_id="job_parallel_sources",
        )

        self.assertIsNotNone(payload)
        self.assertEqual(payload["source_counts"]["completed"], 3)
        self.assertEqual(payload["source_counts"]["error"], 1)
        self.assertEqual(payload["source_counts"]["skipped"], 1)
        self.assertEqual(payload["source_counts"]["active"], 0)
        self.assertEqual(payload["status"], "partial_error")
        self.assertEqual(payload["steps"][5]["id"], "summaries")
        self.assertEqual(payload["steps"][5]["status"], "error")
        self.assertEqual(payload["recent_completed_items"][0]["id"], "hf_models_new")

    def test_start_session_reload_creates_job_state_and_reuses_existing_job(
        self,
    ) -> None:
        scheduled_job_ids: list[str] = []

        first = start_session_reload(
            self.store,
            schedule_reload=lambda job_id: scheduled_job_ids.append(job_id),
        )

        self.assertIsNotNone(first["job_id"])
        self.assertEqual(first["poll_path"], f"/api/jobs/{first['job_id']}")
        self.assertEqual(scheduled_job_ids, [first["job_id"]])

        active_job = get_active_job_response(self.store, surface="dashboard")
        self.assertIsNotNone(active_job)
        self.assertEqual(active_job["job_id"], first["job_id"])

        progress = get_job_progress_response(self.store, job_id=first["job_id"])
        self.assertIsNotNone(progress)
        self.assertEqual(progress["status"], "queued")
        self.assertEqual(progress["stage"], "starting")

        duplicate = start_session_reload(
            self.store,
            schedule_reload=lambda job_id: scheduled_job_ids.append(f"duplicate:{job_id}"),
        )
        self.assertEqual(duplicate["job_id"], first["job_id"])
        self.assertEqual(scheduled_job_ids, [first["job_id"]])
        set_session_reload_running(False)

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

    def test_session_includes_lmarena_type_rankings(self) -> None:
        run_id = "2026-03-24T111112Z_lmarena"
        documents = build_base_documents(run_id) + [
            make_document(
                run_id=run_id,
                document_id="lmarena:text",
                source="lmarena_overview",
                source_category="benchmark",
                title="LMArena Text",
                feed_score=91,
                sort_at="2026-03-24T12:00:00Z",
                reference_url="https://arena.ai/leaderboard/text",
                doc_type_override="benchmark_panel",
                metadata={
                    "leaderboard_link": "/leaderboard/text",
                    "total_votes": 5602397,
                    "total_models": 330,
                    "top_entries": [
                        {
                            "rank": 1,
                            "model_name": "Model Alpha",
                            "organization": "Org A",
                            "rating": 1402.5,
                            "votes": 230123,
                            "url": "https://arena.ai/model-alpha",
                        },
                        {
                            "rank": 2,
                            "model_name": "Model Beta",
                            "organization": "Org B",
                            "rating": 1398.1,
                            "votes": 210456,
                            "url": "https://arena.ai/model-beta",
                        },
                    ],
                },
                benchmark={
                    "kind": "leaderboard_panel",
                    "board_id": "/leaderboard/text",
                    "board_name": "LMArena Text",
                    "snapshot_at": "2026-03-24T12:00:00Z",
                    "rank": 1,
                    "score_label": "Arena rating",
                    "score_value": 1402.5,
                    "score_unit": "elo_like_rating",
                    "votes": 230123,
                    "model_name": "Model Alpha",
                    "organization": "Org A",
                    "total_models": 330,
                    "total_votes": 5602397,
                },
            )
        ]

        run_dir = self._make_run(run_id, documents=documents)
        publish_run(self.store, run_dir, queue=False)
        dashboard = get_dashboard_response(self.store)

        arena_overview = dashboard["session"]["arenaOverview"]
        self.assertIsNotNone(arena_overview)
        self.assertEqual(arena_overview["title"], "Arena Rank Feed")
        self.assertEqual(arena_overview["boards"][0]["label"], "Text")
        self.assertEqual(
            arena_overview["boards"][0]["documentId"],
            "lmarena:text",
        )
        self.assertEqual(
            arena_overview["boards"][0]["topModel"]["modelName"],
            "Model Alpha",
        )
        self.assertIsNotNone(arena_overview["boards"][0]["description"])
        self.assertEqual(len(arena_overview["boards"][0]["topEntries"]), 2)
        lmarena_feed = next(
            feed for feed in dashboard["feeds"] if feed["id"] == "lmarena_overview"
        )
        self.assertEqual(lmarena_feed["items"][0]["type"], "Rank Board")
        self.assertIn("Arena rating 1,402.5", lmarena_feed["items"][0]["meta"])
        self.assertNotIn("elo_like_rating", lmarena_feed["items"][0]["meta"])

    def test_models_category_is_included_in_dashboard_digest_and_feed(self) -> None:
        run_dir = self._make_run("2026-03-24T111112Z_models")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]

        summary_result = run_session_enrichment(self.store, session_id)
        dashboard = get_dashboard_response(self.store, session_id)

        self.assertEqual(summary_result["meta"]["status"], "ready")
        self.assertTrue(
            any(digest["id"] == "models" for digest in dashboard["summary"]["digests"])
        )
        self.assertTrue(
            any(feed["eyebrow"] == "Models" for feed in dashboard["feeds"])
        )
        models_digest = next(
            digest
            for digest in dashboard["summary"]["digests"]
            if digest["id"] == "models"
        )
        self.assertEqual(models_digest["evidence"], "1 docs · Model")
        models_feed = next(
            feed for feed in dashboard["feeds"] if feed["id"] == "hf_models_new"
        )
        self.assertEqual(models_feed["items"][0]["type"], "Model")

    def test_leaderboard_response_exposes_dedicated_payload(self) -> None:
        run_id = "2026-03-24T111113Z_leaderboard_api"
        documents = build_base_documents(run_id) + [
            make_document(
                run_id=run_id,
                document_id="lmarena:vision",
                source="lmarena_overview",
                source_category="benchmark",
                title="LMArena Vision",
                feed_score=90,
                sort_at="2026-03-24T12:30:00Z",
                reference_url="https://arena.ai/leaderboard/vision",
                doc_type_override="benchmark_panel",
                metadata={
                    "leaderboard_link": "/leaderboard/vision",
                    "total_votes": 810245,
                    "total_models": 94,
                    "top_entries": [
                        {
                            "rank": 1,
                            "model_name": "Vision Alpha",
                            "organization": "Vision Org",
                            "rating": 1288.1,
                            "votes": 12003,
                            "url": "https://arena.ai/vision-alpha",
                        }
                    ],
                },
                benchmark={
                    "kind": "leaderboard_panel",
                    "board_id": "/leaderboard/vision",
                    "board_name": "LMArena Vision",
                    "snapshot_at": "2026-03-24T12:30:00Z",
                    "rank": 1,
                    "score_value": 1288.1,
                    "votes": 12003,
                    "model_name": "Vision Alpha",
                    "organization": "Vision Org",
                    "total_models": 94,
                    "total_votes": 810245,
                },
            )
        ]

        run_dir = self._make_run(run_id, documents=documents)
        result = publish_run(self.store, run_dir, queue=False)

        payload = get_leaderboard_response(self.store, session=result["session_id"])
        self.assertEqual(payload["sessionId"], result["session_id"])
        self.assertEqual(payload["status"], "published")
        self.assertIsNotNone(payload["leaderboard"])
        self.assertEqual(payload["leaderboard"]["boards"][0]["label"], "Vision")
        self.assertEqual(
            payload["leaderboard"]["boards"][0]["documentId"],
            "lmarena:vision",
        )
        self.assertEqual(
            payload["leaderboard"]["boards"][0]["topModel"]["modelName"],
            "Vision Alpha",
        )

    def test_leaderboard_response_recovers_from_stale_dashboard(self) -> None:
        run_id = "2026-03-24T111114Z_stale_leaderboard"
        documents = build_base_documents(run_id) + [
            make_document(
                run_id=run_id,
                document_id="lmarena:search",
                source="lmarena_overview",
                source_category="benchmark",
                title="LMArena Search",
                feed_score=87,
                sort_at="2026-03-24T12:45:00Z",
                reference_url="https://arena.ai/leaderboard/search",
                doc_type_override="benchmark_panel",
                metadata={
                    "leaderboard_link": "/leaderboard/search",
                    "total_votes": 247944,
                    "total_models": 22,
                    "top_entries": [
                        {
                            "rank": 1,
                            "model_name": "Search Alpha",
                            "organization": "Org Search",
                            "rating": 1255.41,
                            "votes": 3607,
                            "url": "https://arena.ai/search-alpha",
                        }
                    ],
                },
                benchmark={
                    "kind": "leaderboard_panel",
                    "board_id": "/leaderboard/search",
                    "board_name": "LMArena Search",
                    "snapshot_at": "2026-03-24T12:45:00Z",
                    "rank": 1,
                    "score_value": 1255.41,
                    "votes": 3607,
                    "model_name": "Search Alpha",
                    "organization": "Org Search",
                    "total_models": 22,
                    "total_votes": 247944,
                },
            )
        ]

        run_dir = self._make_run(run_id, documents=documents)
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]
        dashboard = get_json(self.store, session_key(session_id, "dashboard"))
        dashboard["session"]["arenaOverview"] = None
        self.store.set(session_key(session_id, "dashboard"), json.dumps(dashboard))

        payload = get_leaderboard_response(self.store, session=session_id)
        self.assertIsNotNone(payload["leaderboard"])
        self.assertEqual(payload["leaderboard"]["boards"][0]["label"], "Search")
        rebuilt_dashboard = get_json(self.store, session_key(session_id, "dashboard"))
        self.assertIsNotNone(rebuilt_dashboard["session"]["arenaOverview"])

    def test_enrichment_without_llm_provider_still_creates_digests(self) -> None:
        run_dir = self._make_run("2026-03-24T000103Z_enrich")
        result = publish_run(self.store, run_dir)
        session_id = result["session_id"]

        summary_result = run_session_enrichment(self.store, session_id)
        meta = summary_result["meta"]

        self.assertEqual(meta["status"], "ready")
        self.assertTrue(meta["digests_ready"])
        self.assertEqual(meta["summaries_ready"], 0)
        self.assertEqual(meta["summary_provider"], "noop")

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
        self.assertIsNone(dashboard["summary"].get("briefing"))

        stored_document = get_document_response(
            self.store,
            "papers:top",
            session=session_id,
        )
        self.assertEqual(stored_document["llm"]["status"], "pending")

    def test_custom_summary_provider_can_be_injected(self) -> None:
        run_dir = self._make_run("2026-03-24T000103Z_injected")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]

        summary_result = run_session_enrichment(
            self.store,
            session_id,
            generator=build_summary_generator("heuristic"),
        )

        self.assertGreater(summary_result["meta"]["summaries_ready"], 0)
        document = get_document_response(
            self.store,
            "papers:top",
            session=session_id,
        )
        self.assertEqual(document["llm"]["status"], "complete")
        self.assertIsNotNone(document["llm"]["summary_short"])

    def test_briefing_is_persisted_and_survives_dashboard_rebuild(self) -> None:
        run_dir = self._make_run("2026-03-24T000103Z_briefing")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]
        briefing_generator = StaticBriefingGenerator()

        summary_result = run_session_enrichment(
            self.store,
            session_id,
            briefing_generator=briefing_generator,
        )

        self.assertIsNotNone(summary_result["dashboard"]["summary"]["briefing"])
        self.assertIn(
            "[Papers]",
            summary_result["dashboard"]["summary"]["briefing"]["body_en"],
        )
        self.assertIsNotNone(get_json(self.store, session_key(session_id, "briefing")))
        self.store.delete(session_key(session_id, "dashboard"))

        rebuilt = get_dashboard_response(self.store, session_id)
        self.assertIsNotNone(rebuilt["summary"]["briefing"])
        self.assertEqual(
            rebuilt["summary"]["briefing"]["body_en"],
            summary_result["dashboard"]["summary"]["briefing"]["body_en"],
        )
        self.assertFalse(briefing_generator.closed)

    def test_runtime_summary_artifacts_are_written_to_labels_with_ids(self) -> None:
        run_dir = self._make_run("2026-03-24T000103Z_runtime-artifacts")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]

        run_session_enrichment(
            self.store,
            session_id,
            generator=build_summary_generator("heuristic"),
            briefing_generator=StaticBriefingGenerator(),
        )

        summary_rows = read_ndjson_file(
            run_dir / "labels" / "session_document_summaries.ndjson"
        )
        digest_rows = read_ndjson_file(
            run_dir / "labels" / "session_category_digests.ndjson"
        )
        briefing_rows = read_ndjson_file(
            run_dir / "labels" / "session_briefings.ndjson"
        )

        papers_summary = next(
            row for row in summary_rows if row["document_id"] == "papers:top"
        )
        self.assertEqual(
            papers_summary["summary_id"],
            f"{session_id}:document:papers:top",
        )
        self.assertEqual(papers_summary["status"], "complete")
        self.assertEqual(papers_summary["provider_name"], "heuristic")
        self.assertTrue(papers_summary["summary_short"])

        papers_digest = next(row for row in digest_rows if row["category"] == "papers")
        self.assertEqual(
            papers_digest["digest_id"],
            f"{session_id}:digest:papers",
        )
        self.assertIn("papers:top", papers_digest["document_ids"])

        self.assertEqual(len(briefing_rows), 1)
        self.assertEqual(
            briefing_rows[0]["briefing_id"],
            f"{session_id}:briefing:daily",
        )
        self.assertIn("[Papers]", briefing_rows[0]["body_en"])

    def test_build_briefing_input_caps_items_and_adds_session_overview(self) -> None:
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        run_id = "briefing-input"
        documents: list[dict] = []
        feed_lists: dict[str, list[str]] = {
            "arxiv_rss_cs_ai": [],
            "hf_daily_papers": [],
            "hf_models_likes": [],
            "openai_news_rss": [],
            "google_ai_blog": [],
            "reddit_machinelearning": [],
            "hf_models_new": [],
        }

        for idx in range(14):
            doc = make_document(
                run_id=run_id,
                document_id=f"papers:{idx}",
                source="arxiv_rss_cs_ai",
                source_category="papers",
                title=f"Paper {idx}",
                feed_score=100 - idx,
                sort_at=(now - timedelta(hours=idx)).isoformat().replace("+00:00", "Z"),
                reference_url=f"https://example.com/papers/{idx}",
            )
            doc["labels"] = {"paper_domain": "agents" if idx < 8 else "reasoning"}
            documents.append(doc)
            feed_lists["arxiv_rss_cs_ai"].append(doc["document_id"])

        for idx in range(10):
            source = "openai_news_rss" if idx < 5 else "google_ai_blog"
            category = "company" if idx < 6 else "company_kr"
            doc = make_document(
                run_id=run_id,
                document_id=f"company:{idx}",
                source=source,
                source_category=category,
                title=f"Company {idx}",
                feed_score=95 - idx,
                sort_at=(now - timedelta(minutes=idx)).isoformat().replace("+00:00", "Z"),
                reference_url=f"https://example.com/company/{idx}",
            )
            doc["labels"] = {
                "company": {
                    "decision": "keep",
                    "company_domain": "model_release" if idx < 6 else "product_update",
                }
            }
            documents.append(doc)
            feed_lists[source].append(doc["document_id"])

        for idx in range(8):
            doc = make_document(
                run_id=run_id,
                document_id=f"model:{idx}",
                source="hf_models_new",
                source_category="models",
                title=f"Model {idx}",
                feed_score=90 - idx,
                sort_at=(now - timedelta(minutes=30 + idx)).isoformat().replace("+00:00", "Z"),
                reference_url=f"https://example.com/model/{idx}",
                doc_type_override="model",
            )
            doc["discovery"] = {
                "is_new": True,
                "age_hours": 1,
                "freshness_bucket": "just_now",
                "spark_score": 95,
                "spark_bucket": "sparkling",
                "primary_reason": "new_model_feed",
            }
            doc["ranking"] = {
                "feed_score": 95,
                "feed_bucket": "top",
                "age_penalty": 0,
                "evergreen_bonus": 0,
                "priority_reason": "fresh_and_hot",
            }
            documents.append(doc)
            feed_lists["hf_models_new"].append(doc["document_id"])

        for idx in range(7):
            doc = make_document(
                run_id=run_id,
                document_id=f"community:{idx}",
                source="reddit_machinelearning",
                source_category="community",
                title=f"Community {idx}",
                feed_score=80 - idx,
                sort_at=(now - timedelta(minutes=60 + idx)).isoformat().replace("+00:00", "Z"),
                reference_url=f"https://example.com/community/{idx}",
            )
            documents.append(doc)
            feed_lists["reddit_machinelearning"].append(doc["document_id"])

        for idx in range(2):
            doc = make_document(
                run_id=run_id,
                document_id=f"hf-paper:{idx}",
                source="hf_daily_papers",
                source_category="papers",
                title=f"HF Daily Paper {idx}",
                feed_score=70 - idx,
                sort_at=(now - timedelta(minutes=90 + idx)).isoformat().replace("+00:00", "Z"),
                reference_url=f"https://example.com/hf-paper/{idx}",
            )
            doc["labels"] = {"paper_domain": "evaluation"}
            documents.append(doc)
            feed_lists["hf_daily_papers"].append(doc["document_id"])

        for idx in range(2):
            doc = make_document(
                run_id=run_id,
                document_id=f"hf-like:{idx}",
                source="hf_models_likes",
                source_category="models",
                title=f"HF Hype Model {idx}",
                feed_score=85 - idx,
                sort_at=(now - timedelta(minutes=120 + idx)).isoformat().replace("+00:00", "Z"),
                reference_url=f"https://example.com/hf-like/{idx}",
                doc_type_override="model",
            )
            doc["discovery"] = {
                "is_new": False,
                "age_hours": 24 * 180,
                "freshness_bucket": "established",
                "spark_score": 40,
                "spark_bucket": "steady",
                "primary_reason": "established",
            }
            doc["ranking"] = {
                "feed_score": 14,
                "feed_bucket": "archive",
                "age_penalty": 38,
                "evergreen_bonus": 12,
                "priority_reason": "evergreen",
            }
            documents.append(doc)
            feed_lists["hf_models_likes"].append(doc["document_id"])

        documents_by_id = {doc["document_id"]: doc for doc in documents}

        briefing_input = build_briefing_input(documents_by_id, feed_lists)

        self.assertEqual(len(briefing_input["papers"]), 16)
        self.assertEqual(len(briefing_input["company"]), 8)
        self.assertEqual(len(briefing_input["models"]), 6)
        self.assertEqual(len(briefing_input["community"]), 8)
        self.assertEqual(briefing_input["session"]["window"], "today")
        self.assertEqual(briefing_input["session"]["category_counts"]["papers"], 16)
        self.assertEqual(briefing_input["session"]["category_counts"]["company"], 8)
        self.assertEqual(briefing_input["session"]["category_counts"]["community"], 8)
        self.assertIn("agents", briefing_input["session"]["dominant_paper_domains"])
        self.assertIn("arxiv", briefing_input["session"]["paper_source_groups"])
        self.assertIn("hf_daily", briefing_input["session"]["paper_source_groups"])
        self.assertEqual(briefing_input["papers"][0]["source_group"], "arxiv")
        self.assertIn("source", briefing_input["papers"][0])
        self.assertIn("model_release", briefing_input["session"]["dominant_company_domains"])
        self.assertIn("model_release", briefing_input["session"]["company_issue_domains"])
        self.assertIn("hf_daily_papers", briefing_input["session"]["active_community_sources"])
        self.assertIn("hf_models_new", briefing_input["session"]["active_model_sources"])
        self.assertIn("hf_daily_papers", briefing_input["session"]["hf_community_sources"])
        self.assertIn("hf_models_new", briefing_input["session"]["hf_model_sources"])
        self.assertIn("fresh_and_hot", briefing_input["session"]["model_signal_reasons"])
        self.assertEqual(briefing_input["models"][0]["source"], "hf_models_new")
        self.assertIn("signal_reason", briefing_input["models"][0])
        self.assertIn("downloads", briefing_input["models"][0])

    def test_today_intro_is_non_numeric_and_handles_no_company_issue(self) -> None:
        intro = _build_today_intro(
            {
                "dominant_paper_domains": ["vlm", "reasoning"],
                "company_issue_domains": [],
                "hf_community_sources": ["hf_daily_papers"],
                "hf_model_sources": ["hf_models_new"],
            }
        )
        self.assertIn("Today’s flow", intro)
        self.assertIn("no single company issue", intro)
        self.assertIn("Hugging Face", intro)
        self.assertNotIn("papers 12", intro)

    def test_models_section_names_top_signal_and_trending_items(self) -> None:
        section = _build_models_section(
            {
                "hf_model_sources": ["hf_trending_models", "hf_models_new"],
            },
            [
                {
                    "title": "Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled",
                    "source": "hf_trending_models",
                    "likes": 1247,
                    "downloads": 173865,
                    "feed_score": 100,
                    "trend_rank": 2,
                },
                {
                    "title": "nvidia/Nemotron-Cascade-2-30B-A3B",
                    "source": "hf_trending_models",
                    "likes": 282,
                    "downloads": 38586,
                    "feed_score": 100,
                    "trend_rank": 3,
                },
                {
                    "title": "fresh/upload-alpha",
                    "source": "hf_models_new",
                    "likes": 0,
                    "downloads": 0,
                    "feed_score": 95,
                    "freshness": "just_now",
                },
            ],
            "",
        )
        self.assertIn("Top signal today", section)
        self.assertIn("Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled", section)
        self.assertIn("Also trending on Hugging Face", section)
        self.assertIn("nvidia/Nemotron-Cascade-2-30B-A3B", section)
        self.assertIn(
            "Fresh uploads are active, with attention still spread across several new entries.",
            section,
        )

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

    def test_session_rollover_prunes_sessions_beyond_retention_limit(self) -> None:
        first_run_dir = self._make_run("2026-03-24T010101Z_first")
        second_run_dir = self._make_run("2026-03-24T020202Z_second")
        third_run_dir = self._make_run("2026-03-24T030303Z_third")

        first = publish_run(self.store, first_run_dir, queue=True)
        second = publish_run(self.store, second_run_dir, queue=True)
        third = publish_run(self.store, third_run_dir, queue=True)

        self.assertEqual(self.store.get(ACTIVE_SESSION_KEY), third["session_id"])
        self.assertEqual(
            get_json(self.store, RECENT_SESSIONS_KEY),
            [third["session_id"], second["session_id"]][:SESSION_RETAIN_COUNT],
        )
        self.assertIsNone(
            self.store.get(session_key(first["session_id"], "dashboard")),
        )
        self.assertIsNotNone(
            self.store.get(session_key(second["session_id"], "dashboard")),
        )
        self.assertIsNotNone(
            self.store.get(session_key(third["session_id"], "dashboard")),
        )
        queue_session_ids = [
            json.loads(item)["session_id"]
            for item in self.store.lrange(QUEUE_SESSION_ENRICH_KEY, 0, -1)
        ]
        self.assertNotIn(first["session_id"], queue_session_ids)
        self.assertIn(second["session_id"], queue_session_ids)
        self.assertIn(third["session_id"], queue_session_ids)

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

    def test_dashboard_rebuilds_when_cached_copy_uses_old_schema(self) -> None:
        run_dir = self._make_run("2026-03-24T000106Z_stale_dashboard")
        result = publish_run(self.store, run_dir, queue=False)
        session_id = result["session_id"]

        stale_meta = get_json(self.store, session_key(session_id, "meta"))
        stale_dashboard = get_json(self.store, session_key(session_id, "dashboard"))
        stale_meta["schema_version"] = SCHEMA_VERSION - 1
        stale_dashboard["brand"]["tagline"] = "Redis Session Pipeline"
        self.store.set(
            session_key(session_id, "meta"),
            json.dumps(stale_meta, ensure_ascii=False),
        )
        self.store.set(
            session_key(session_id, "dashboard"),
            json.dumps(stale_dashboard, ensure_ascii=False),
        )

        rebuilt = get_dashboard_response(self.store, session_id)

        self.assertEqual(rebuilt["brand"]["name"], "BLACKSITE")
        self.assertEqual(rebuilt["brand"]["tagline"], "Signal Relay")
        refreshed_meta = get_json(self.store, session_key(session_id, "meta"))
        self.assertEqual(refreshed_meta["schema_version"], SCHEMA_VERSION)

if __name__ == "__main__":
    unittest.main()
