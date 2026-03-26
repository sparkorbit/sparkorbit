from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
import threading
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from ..core.constants import (
    ACTIVE_SESSION_KEY,
    DEFAULT_RUN_LABEL,
    HOMEPAGE_BOOTSTRAP_RUN_LABEL,
    OLLAMA_BASE_URL,
    ORDERED_SOURCE_CATEGORIES,
    QUEUE_SESSION_ENRICH_KEY,
    ROOT_DIR,
    RECENT_SESSIONS_KEY,
    SCHEMA_VERSION,
    SESSION_RETAIN_COUNT,
    SESSION_PREFIX,
    SESSION_TTL_SECONDS,
    SOURCE_CATEGORY_LABELS,
)
from ..core.store import RedisLike
from .collector import collect_run
from .summary_provider import (
    BriefingGenerator,
    SummaryGenerator,
    build_briefing_generator,
    build_summary_generator,
)


@dataclass(frozen=True)
class RunArtifacts:
    run_dir: Path
    run_manifest: dict[str, Any]
    source_manifest: list[dict[str, Any]]
    documents: list[dict[str, Any]]
    company_decisions: list[dict[str, Any]]
    paper_domains: list[dict[str, Any]]


logger = logging.getLogger(__name__)

SESSION_DOCUMENT_SUMMARIES_FILENAME = "session_document_summaries.ndjson"
SESSION_CATEGORY_DIGESTS_FILENAME = "session_category_digests.ndjson"
SESSION_BRIEFINGS_FILENAME = "session_briefings.ndjson"

_HOMEPAGE_BOOTSTRAP_LOCK = threading.Lock()
_HOMEPAGE_BOOTSTRAP_RUNNING = False
_SESSION_RELOAD_LOCK = threading.Lock()
_SESSION_RELOAD_RUNNING = False


def set_homepage_bootstrap_running(is_running: bool) -> None:
    global _HOMEPAGE_BOOTSTRAP_RUNNING
    with _HOMEPAGE_BOOTSTRAP_LOCK:
        _HOMEPAGE_BOOTSTRAP_RUNNING = is_running


def is_homepage_bootstrap_running() -> bool:
    with _HOMEPAGE_BOOTSTRAP_LOCK:
        return _HOMEPAGE_BOOTSTRAP_RUNNING


def set_session_reload_running(is_running: bool) -> None:
    global _SESSION_RELOAD_RUNNING
    with _SESSION_RELOAD_LOCK:
        _SESSION_RELOAD_RUNNING = is_running


def is_session_reload_running() -> bool:
    with _SESSION_RELOAD_LOCK:
        return _SESSION_RELOAD_RUNNING


def now_utc_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def session_key(session_id: str, suffix: str) -> str:
    return f"{SESSION_PREFIX}:{session_id}:{suffix}"


def artifact_root_key(session_id: str) -> str:
    return session_key(session_id, "artifact_root")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_ndjson(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def write_ndjson(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def load_run_artifacts(run_dir: str | Path) -> RunArtifacts:
    root = Path(run_dir)
    normalized_dir = root / "normalized"
    labels_dir = root / "labels"
    return RunArtifacts(
        run_dir=root,
        run_manifest=read_json(root / "run_manifest.json"),
        source_manifest=read_ndjson(root / "source_manifest.ndjson"),
        documents=read_ndjson(normalized_dir / "documents.ndjson"),
        company_decisions=read_ndjson(labels_dir / "company_decisions.ndjson"),
        paper_domains=read_ndjson(labels_dir / "paper_domains.ndjson"),
    )


def json_dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def json_loads(payload: str | None) -> Any:
    if payload is None:
        return None
    return json.loads(payload)


def set_json_with_ttl(
    store: RedisLike,
    key: str,
    payload: Any,
    *,
    ttl: int = SESSION_TTL_SECONDS,
) -> None:
    store.set(key, json_dumps(payload))
    store.expire(key, ttl)


def set_list_with_ttl(
    store: RedisLike,
    key: str,
    values: list[str],
    *,
    ttl: int = SESSION_TTL_SECONDS,
) -> None:
    store.delete(key)
    if values:
        store.rpush(key, *values)
        store.expire(key, ttl)


def get_json(store: RedisLike, key: str) -> Any:
    return json_loads(store.get(key))




def get_recent_session_ids(store: RedisLike) -> list[str]:
    payload = get_json(store, RECENT_SESSIONS_KEY)
    if not isinstance(payload, list):
        return []
    session_ids: list[str] = []
    for item in payload:
        session_id = str(item or "").strip()
        if session_id and session_id not in session_ids:
            session_ids.append(session_id)
    return session_ids


def set_recent_session_ids(store: RedisLike, session_ids: list[str]) -> None:
    if session_ids:
        store.set(RECENT_SESSIONS_KEY, json_dumps(session_ids))
        return
    store.delete(RECENT_SESSIONS_KEY)


def trim_enrichment_queue(store: RedisLike, *, drop_session_ids: set[str]) -> None:
    if not drop_session_ids:
        return
    queued_items = store.lrange(QUEUE_SESSION_ENRICH_KEY, 0, -1)
    if not queued_items:
        return

    filtered_items: list[str] = []
    queue_changed = False
    for item in queued_items:
        payload = json_loads(item)
        session_id = (
            str(payload.get("session_id") or "").strip()
            if isinstance(payload, dict)
            else ""
        )
        if session_id and session_id in drop_session_ids:
            queue_changed = True
            continue
        filtered_items.append(item)

    if not queue_changed:
        return

    store.delete(QUEUE_SESSION_ENRICH_KEY)
    if filtered_items:
        store.rpush(QUEUE_SESSION_ENRICH_KEY, *filtered_items)


def list_session_storage_keys(store: RedisLike, session_id: str) -> list[str]:
    keys = {
        session_key(session_id, "meta"),
        session_key(session_id, "run_manifest"),
        session_key(session_id, "source_manifest"),
        session_key(session_id, "dashboard"),
    }
    meta = get_json(store, session_key(session_id, "meta")) or {}
    source_manifest = get_json(store, session_key(session_id, "source_manifest")) or []
    source_ids = meta.get("source_ids") or [
        entry.get("source") for entry in source_manifest if entry.get("source")
    ]
    feed_lists = get_feed_lists(store, session_id, source_ids)
    for source in source_ids:
        keys.add(feed_key(session_id, str(source)))
    for document_ids in feed_lists.values():
        for document_id in document_ids:
            keys.add(doc_key(session_id, document_id))
    for category in ORDERED_SOURCE_CATEGORIES:
        keys.add(digest_key(session_id, category))
    return sorted(keys)


def delete_session_keys(store: RedisLike, session_id: str) -> None:
    keys = list_session_storage_keys(store, session_id)
    if keys:
        store.delete(*keys)


def prune_stale_sessions(store: RedisLike, current_session_id: str) -> None:
    recent_session_ids = [
        current_session_id,
        *[session_id for session_id in get_recent_session_ids(store) if session_id != current_session_id],
    ]
    retained_session_ids = recent_session_ids[:SESSION_RETAIN_COUNT]
    pruned_session_ids = set(recent_session_ids[SESSION_RETAIN_COUNT:])
    trim_enrichment_queue(store, drop_session_ids=pruned_session_ids)
    for session_id in pruned_session_ids:
        delete_session_keys(store, session_id)
    set_recent_session_ids(store, retained_session_ids)


def to_number(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def compact_text(value: str | None, max_length: int = 124) -> str:
    if not value:
        return ""
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 3].rstrip() + "..."


def prettify_source_name(source: str) -> str:
    parts = []
    for part in source.split("_"):
        if part == "ai":
            parts.append("AI")
        elif part == "rss":
            parts.append("RSS")
        elif part == "hf":
            parts.append("HF")
        elif part == "hn":
            parts.append("HN")
        elif part == "kr":
            parts.append("KR")
        elif part == "cn":
            parts.append("CN")
        elif part == "llm":
            parts.append("LLM")
        else:
            parts.append(part.capitalize())
    return " ".join(parts)


DOC_TYPE_LABELS = {
    "paper": "Paper",
    "blog": "Blog",
    "news": "News",
    "post": "Post",
    "story": "Story",
    "model": "Model",
    "model_trending": "Trending Model",
    "repo": "Repo",
    "release": "Release",
    "release_note": "Release Note",
    "benchmark": "Rank Row",
    "benchmark_panel": "Rank Board",
}


def prettify_doc_type(doc_type: Any) -> str:
    resolved = str(doc_type or "").strip()
    if not resolved:
        return "-"
    return DOC_TYPE_LABELS.get(resolved, prettify_source_name(resolved))


def to_optional_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def format_number(value: Any) -> str:
    numeric = to_optional_number(value)
    if numeric is None:
        return "-"
    if numeric.is_integer():
        return f"{int(numeric):,}"
    return f"{numeric:,.2f}".rstrip("0").rstrip(".")


def format_benchmark_score(benchmark: dict[str, Any]) -> str:
    label = str(benchmark.get("score_label") or "score").strip()
    score = format_number(benchmark.get("score_value"))
    score_unit = str(benchmark.get("score_unit") or "").strip()
    suffix = "%" if score_unit in {"%", "percent"} else ""
    return f"{label} {score}{suffix}"


def build_document_badge(document: dict[str, Any]) -> str:
    metadata = document.get("metadata") or {}
    doc_type = str(document.get("doc_type") or "")
    if doc_type == "repo" and metadata.get("full_name"):
        return str(metadata.get("full_name"))

    author = document.get("author") or (document.get("authors") or [None])[0]
    if author:
        return str(author)

    if doc_type in {"model", "model_trending"}:
        model_id = str(
            document.get("source_item_id") or document.get("title") or ""
        ).strip()
        if "/" in model_id:
            owner = model_id.split("/", 1)[0].strip()
            if owner:
                return owner

    benchmark = document.get("benchmark") or {}
    if doc_type in {"benchmark", "benchmark_panel"} and benchmark.get("board_name"):
        return str(benchmark.get("board_name"))

    return prettify_source_name(str(document.get("source") or ""))


def document_timestamp(document: dict[str, Any]) -> str:
    return (
        document.get("sort_at")
        or document.get("updated_at")
        or document.get("published_at")
        or document.get("fetched_at")
        or ""
    )


def document_sort_key(document: dict[str, Any]) -> tuple[float, str]:
    ranking = document.get("ranking") or {}
    return (
        to_number(ranking.get("feed_score")),
        document_timestamp(document),
    )


def sort_documents(documents: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(documents, key=document_sort_key, reverse=True)


def has_displayable_reference(document: dict[str, Any]) -> bool:
    if not document.get("title"):
        return False
    return any(
        document.get(field) for field in ("reference_url", "canonical_url", "url")
    )


def doc_key(session_id: str, document_id: str) -> str:
    return session_key(session_id, f"doc:{document_id}")


def feed_key(session_id: str, source: str) -> str:
    return session_key(session_id, f"feed:{source}")


def digest_key(session_id: str, category: str) -> str:
    return session_key(session_id, f"digest:{category}")


def resolve_session_artifact_root(
    store: RedisLike,
    session_id: str,
    run_manifest: dict[str, Any],
) -> Path:
    artifact_root = get_json(store, artifact_root_key(session_id))
    if isinstance(artifact_root, str) and artifact_root.strip():
        return Path(artifact_root)
    run_id = str(run_manifest.get("run_id") or session_id).strip()
    return DEFAULT_RUNS_DIR / run_id


def default_llm_state() -> dict[str, Any]:
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


def build_document_note(document: dict[str, Any]) -> str:
    llm = document.get("llm") or {}
    reference = document.get("reference") or {}
    return compact_text(
        llm.get("summary_short")
        or document.get("description")
        or reference.get("snippet")
        or document.get("summary_input_text")
        or document.get("body_text"),
        124,
    )


def build_feed_meta(document: dict[str, Any]) -> str:
    doc_type = document.get("doc_type")
    engagement = document.get("engagement") or {}
    metadata = document.get("metadata") or {}
    if doc_type == "repo":
        return " · ".join(
            [
                f"stars {int(to_number(engagement.get('stars')))}",
                f"lang {metadata.get('language') or '-'}",
                f"updated {document.get('updated_at') or document.get('published_at') or '-'}",
            ]
        )
    if doc_type in {"model", "model_trending"}:
        return " · ".join(
            [
                f"likes {int(to_number(engagement.get('likes')))}",
                f"downloads {int(to_number(engagement.get('downloads')))}",
                f"pipeline {metadata.get('pipeline_tag') or '-'}",
            ]
        )
    if doc_type in {"benchmark", "benchmark_panel"}:
        benchmark = document.get("benchmark") or {}
        return " · ".join(
            [
                benchmark.get("board_name") or "Rank Board",
                f"rank #{benchmark.get('rank') or '-'}",
                format_benchmark_score(benchmark),
            ]
        )
    return " · ".join(
        [
            str(document.get("author") or prettify_source_name(document.get("source") or "")),
            str(document.get("published_at") or document.get("updated_at") or "-"),
            str(
                (document.get("ranking") or {}).get("priority_reason")
                or (document.get("discovery") or {}).get("spark_bucket")
                or doc_type
                or "-"
            ),
        ]
    )


def build_feed_item(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "documentId": document["document_id"],
        "referenceUrl": document.get("reference_url")
        or document.get("canonical_url")
        or document.get("url")
        or "",
        "source": build_document_badge(document),
        "type": prettify_doc_type(document.get("doc_type")),
        "title": str(document.get("title") or "-"),
        "meta": build_feed_meta(document),
        "note": build_document_note(document),
    }



def build_runtime_items(status: str, *, stage: str | None = None) -> list[dict[str, str]]:
    enricher_status = "queued"
    collector_status = "completed"
    redis_status = status
    if stage in {"starting", "fetching_sources", "writing_artifacts"}:
        collector_status = "running"
        redis_status = "waiting"
    elif stage in {"publishing_session", "publishing_documents", "publishing_views"}:
        collector_status = "completed"
        redis_status = "running"

    if status == "summarizing" or stage in {"summarizing_documents", "building_digests"}:
        enricher_status = "running"
    elif status in {"ready", "partial_error"}:
        enricher_status = "complete"
    elif status == "error":
        enricher_status = "error"

    return [
        {
            "name": "collector",
            "role": "Collector maintains raw traces as canonical artifacts.",
            "status": collector_status,
        },
        {
            "name": "enricher",
            "role": "Extracts key lines and generates signal sweeps.",
            "status": enricher_status,
        },
        {
            "name": "redis",
            "role": "Relay cache stores documents, feeds, sweeps, and live views.",
            "status": redis_status,
        },
        {
            "name": "ui",
            "role": "UI reads only relay responses and trace details.",
            "status": "live",
        },
    ]



def build_session_block(
    session_id: str,
    meta: dict[str, Any],
    run_manifest: dict[str, Any],
    source_manifest: list[dict[str, Any]],
    documents_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    _ts = meta.get("created_at") or run_manifest.get("started_at") or ""
    session_date = _ts[:16].replace("T", " ") if len(_ts) >= 16 else _ts[:10]
    digests_ready = "yes" if meta.get("digests_ready") else "no"
    session_status = str(meta.get("status") or "published")
    arena_overview = build_lmarena_session_overview(documents_by_id)
    return {
        "title": "Relay Cache",
        "sessionId": session_id,
        "sessionDate": session_date or "unknown",
        "window": "live scan",
        "reloadRule": "POST /api/sessions/reload triggers a new scan and swaps the active cache.",
        "metrics": [
            {
                "label": "sources",
                "value": str(
                    len(
                        [
                            entry
                            for entry in source_manifest
                            if entry.get("status") != "error"
                        ]
                    )
                ),
                "note": "Number of sources linked to the current cache",
            },
            {
                "label": "docs",
                "value": str(meta.get("docs_total", 0)),
                "note": "Number of documents with live references",
            },
            {
                "label": "sweeps",
                "value": digests_ready,
                "note": f"summaries {meta.get('summaries_ready', 0)} / state {meta.get('status')}",
            },
        ],
        "runtime": build_runtime_items(session_status),
        "rules": [
            "Run output is the canonical reference data.",
            "Cache only holds per-source feeds and UI views.",
            "Cross-source mixing is performed only in sweeps.",
        ],
        "arenaOverview": arena_overview,
    }


def lmarena_board_label(document: dict[str, Any]) -> str:
    benchmark = document.get("benchmark") or {}
    board_name = str(benchmark.get("board_name") or "").strip()
    if board_name.startswith("LMArena "):
        return board_name.removeprefix("LMArena ").strip() or "Overview"
    metadata = document.get("metadata") or {}
    leaderboard_link = str(
        benchmark.get("board_id")
        or metadata.get("leaderboard_link")
        or document.get("source_item_id")
        or ""
    ).strip()
    if leaderboard_link:
        label = leaderboard_link.rsplit("/", 1)[-1].replace("-", " ").strip()
        return label.title() or "Overview"
    title = str(document.get("title") or "").replace("LMArena", "").strip()
    return title or "Overview"


def build_lmarena_session_overview(
    documents_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    lmarena_documents = [
        document
        for document in documents_by_id.values()
        if document.get("source") == "lmarena_overview"
    ]
    if not lmarena_documents:
        return None

    boards = []
    for document in sort_documents(lmarena_documents):
        benchmark = document.get("benchmark") or {}
        metadata = document.get("metadata") or {}
        top_entries = metadata.get("top_entries") if isinstance(metadata.get("top_entries"), list) else []
        normalized_entries = []
        for entry in top_entries:
            if not isinstance(entry, dict):
                continue
            normalized_entries.append(
                {
                    "rank": entry.get("rank"),
                    "modelName": entry.get("model_name"),
                    "organization": entry.get("organization"),
                    "rating": entry.get("rating"),
                    "votes": entry.get("votes"),
                    "url": entry.get("url"),
                    "license": entry.get("license"),
                    "contextLength": entry.get("context_length"),
                    "inputPricePerMillion": entry.get("input_price_per_million"),
                    "outputPricePerMillion": entry.get("output_price_per_million"),
                }
            )
        boards.append(
            {
                "id": str(
                    benchmark.get("board_id")
                    or metadata.get("leaderboard_link")
                    or document.get("document_id")
                ),
                "label": lmarena_board_label(document),
                "boardName": str(
                    benchmark.get("board_name") or document.get("title") or "LMArena"
                ),
                "documentId": str(document.get("document_id") or ""),
                "referenceUrl": document.get("reference_url")
                or document.get("canonical_url")
                or document.get("url"),
                "updatedAt": benchmark.get("snapshot_at")
                or document.get("published_at")
                or document.get("sort_at"),
                "description": document.get("description")
                or (document.get("reference") or {}).get("snippet"),
                "totalVotes": benchmark.get("total_votes")
                or metadata.get("total_votes"),
                "totalModels": benchmark.get("total_models")
                or metadata.get("total_models"),
                "scoreLabel": benchmark.get("score_label") or "Arena rating",
                "scoreUnit": benchmark.get("score_unit"),
                "topModel": {
                    "rank": benchmark.get("rank"),
                    "modelName": benchmark.get("model_name")
                    or metadata.get("top_model_name"),
                    "organization": benchmark.get("organization")
                    or metadata.get("top_model_org"),
                    "rating": benchmark.get("score_value")
                    or metadata.get("top_model_rating"),
                    "votes": benchmark.get("votes")
                    or metadata.get("top_model_votes"),
                },
                "topEntries": normalized_entries,
            }
        )

    return {
        "title": "Arena Rank Feed",
        "boards": boards,
    }


def build_placeholder_digest(
    category: str, documents: list[dict[str, Any]]
) -> dict[str, Any]:
    label = SOURCE_CATEGORY_LABELS.get(category, category)
    top_document = documents[0] if documents else None
    return {
        "id": category,
        "domain": label,
        "headline": top_document.get("title") if top_document else "No representative document",
        "summary": (
            build_document_note(top_document)
            if top_document
            else "No documents in this category yet."
        ),
        "evidence": (
            f"{len(documents)} docs · {prettify_doc_type(top_document.get('doc_type'))}"
            if top_document
            else f"{len(documents)} docs · -"
        ),
        "document_ids": [document["document_id"] for document in documents[:8]],
        "updated_at": now_utc_iso(),
    }


def build_digest_from_documents(
    category: str, documents: list[dict[str, Any]]
) -> dict[str, Any]:
    digest = build_placeholder_digest(category, documents)
    if not documents:
        return digest

    top_document = documents[0]
    llm = top_document.get("llm") or {}
    summaries = [
        compact_text(
            (document.get("llm") or {}).get("summary_short")
            or build_document_note(document),
            140,
        )
        for document in documents[:3]
    ]
    digest["headline"] = (
        llm.get("summary_1l") or top_document.get("title") or digest["headline"]
    )
    digest["summary"] = " ".join(summary for summary in summaries if summary)
    digest["evidence"] = (
        f"{len(documents)} docs · {prettify_doc_type(top_document.get('doc_type'))}"
    )
    digest["document_ids"] = [document["document_id"] for document in documents[:8]]
    digest["updated_at"] = now_utc_iso()
    return digest


def build_session_document_summary_rows(
    session_id: str,
    run_id: str,
    documents_by_id: dict[str, dict[str, Any]],
    *,
    provider_name: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for document in sort_documents(list(documents_by_id.values())):
        llm = document.get("llm") or {}
        run_meta = llm.get("run_meta") or {}
        document_id = str(document.get("document_id") or "")
        rows.append(
            {
                "summary_id": f"{session_id}:document:{document_id}",
                "artifact_type": "document_summary",
                "session_id": session_id,
                "run_id": run_id,
                "document_id": document_id,
                "source": document.get("source"),
                "source_category": document.get("source_category"),
                "status": llm.get("status"),
                "summary_1l": llm.get("summary_1l"),
                "summary_short": llm.get("summary_short"),
                "key_points": llm.get("key_points") or [],
                "entities": llm.get("entities") or [],
                "primary_domain": llm.get("primary_domain"),
                "subdomains": llm.get("subdomains") or [],
                "importance_score": llm.get("importance_score"),
                "importance_reason": llm.get("importance_reason"),
                "evidence_chunk_ids": llm.get("evidence_chunk_ids") or [],
                "provider_name": provider_name,
                "model_name": run_meta.get("model_name"),
                "prompt_version": run_meta.get("prompt_version"),
                "fewshot_pack_version": run_meta.get("fewshot_pack_version"),
                "generated_at": run_meta.get("generated_at"),
            }
        )
    return rows


def build_session_category_digest_rows(
    session_id: str,
    run_id: str,
    digests_by_category: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for category in ORDERED_SOURCE_CATEGORIES:
        digest = digests_by_category.get(category)
        if digest is None:
            continue
        rows.append(
            {
                "digest_id": f"{session_id}:digest:{category}",
                "artifact_type": "category_digest",
                "session_id": session_id,
                "run_id": run_id,
                "category": category,
                "domain": SOURCE_CATEGORY_LABELS.get(category, category),
                "headline": digest.get("headline"),
                "summary": digest.get("summary"),
                "evidence": digest.get("evidence"),
                "document_ids": digest.get("document_ids") or [],
                "updated_at": digest.get("updated_at"),
            }
        )
    return rows


def build_session_briefing_rows(
    session_id: str,
    run_id: str,
    briefing: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if briefing is None:
        return []
    run_meta = briefing.get("run_meta") or {}
    return [
        {
            "briefing_id": f"{session_id}:briefing:daily",
            "artifact_type": "session_briefing",
            "session_id": session_id,
            "run_id": run_id,
            "body_en": briefing.get("body_en"),
            "category_summaries": briefing.get("category_summaries") or {},
            "error": briefing.get("error"),
            "model_name": run_meta.get("model_name"),
            "prompt_version": run_meta.get("prompt_version"),
            "generated_at": run_meta.get("generated_at"),
        }
    ]


def persist_session_runtime_artifacts(
    run_dir: Path,
    *,
    session_id: str,
    run_id: str,
    documents_by_id: dict[str, dict[str, Any]],
    digests_by_category: dict[str, dict[str, Any]],
    briefing: dict[str, Any] | None,
    provider_name: str,
) -> None:
    labels_dir = run_dir / "labels"
    labels_dir.mkdir(parents=True, exist_ok=True)
    write_ndjson(
        labels_dir / SESSION_DOCUMENT_SUMMARIES_FILENAME,
        build_session_document_summary_rows(
            session_id,
            run_id,
            documents_by_id,
            provider_name=provider_name,
        ),
    )
    write_ndjson(
        labels_dir / SESSION_CATEGORY_DIGESTS_FILENAME,
        build_session_category_digest_rows(session_id, run_id, digests_by_category),
    )
    write_ndjson(
        labels_dir / SESSION_BRIEFINGS_FILENAME,
        build_session_briefing_rows(session_id, run_id, briefing),
    )


def _is_recent(doc: dict[str, Any], cutoff_date: str) -> bool:
    date_str = (doc.get("published_at") or doc.get("sort_at") or "")[:10]
    return date_str >= cutoff_date


def build_briefing_input(
    documents_by_id: dict[str, dict[str, Any]],
    feed_lists: dict[str, list[str]],
) -> dict[str, Any]:
    from datetime import datetime, timedelta, timezone

    issue_domains = {
        "model_release",
        "product_update",
        "open_source",
        "benchmark_eval",
        "partnership_ecosystem",
        "policy_safety",
    }
    max_papers = 16
    max_company = 8
    max_models = 6
    max_community = 8
    today = datetime.now(timezone.utc)
    cutoff_date = (today - timedelta(days=1)).strftime("%Y-%m-%d")

    category_docs: dict[str, list[dict[str, Any]]] = {}
    source_docs: dict[str, list[dict[str, Any]]] = {}
    for _source, doc_ids in feed_lists.items():
        for doc_id in doc_ids:
            doc = documents_by_id.get(doc_id)
            if doc is None:
                continue
            if not _is_recent(doc, cutoff_date):
                continue
            cat = str(doc.get("source_category") or "community")
            category_docs.setdefault(cat, []).append(doc)
            source_docs.setdefault(str(doc.get("source") or ""), []).append(doc)
    for cat in category_docs:
        category_docs[cat] = sort_documents(category_docs[cat])
    for source in source_docs:
        source_docs[source] = sort_documents(source_docs[source])

    def _title(doc: dict[str, Any]) -> str:
        return compact_text(str(doc.get("title") or ""), 120)

    def _engagement_value(doc: dict[str, Any]) -> int:
        ep = doc.get("engagement_primary") or {}
        return int(ep.get("value") or 0)

    def _engagement_metric(doc: dict[str, Any], key: str) -> int:
        engagement = doc.get("engagement") or {}
        return int(engagement.get(key) or 0)

    def _top_values(
        rows: list[dict[str, Any]],
        key: str,
        *,
        limit: int = 3,
    ) -> list[str]:
        counter: Counter[str] = Counter()
        for row in rows:
            value = str(row.get(key) or "").strip()
            if value:
                counter[value] += 1
        return [value for value, _count in counter.most_common(limit)]

    def _paper_source_group(doc: dict[str, Any]) -> str:
        source = str(doc.get("source") or "")
        if source.startswith("arxiv_rss_"):
            return "arxiv"
        if source == "hf_daily_papers":
            return "hf_daily"
        return "other"

    def _append_community_doc(
        target: list[dict[str, str]],
        selected_ids: set[str],
        doc: dict[str, Any],
    ) -> None:
        document_id = str(doc.get("document_id") or "")
        if not document_id or document_id in selected_ids or len(target) >= max_community:
            return
        target.append(
            {
                "title": _title(doc),
                "source": str(doc.get("source") or ""),
            }
        )
        selected_ids.add(document_id)

    def _append_paper_doc(
        target: list[dict[str, str]],
        selected_ids: set[str],
        doc: dict[str, Any],
    ) -> None:
        document_id = str(doc.get("document_id") or "")
        if not document_id or document_id in selected_ids or len(target) >= max_papers:
            return
        target.append(
            {
                "title": _title(doc),
                "domain": (doc.get("labels") or {}).get("paper_domain", "others"),
                "source": str(doc.get("source") or ""),
                "source_group": _paper_source_group(doc),
            }
        )
        selected_ids.add(document_id)

    papers: list[dict[str, str]] = []
    paper_ids: set[str] = set()
    paper_docs = category_docs.get("papers", [])
    for source_group, per_group_limit in (
        ("arxiv", 10),
        ("hf_daily", 3),
        ("other", 3),
    ):
        for doc in paper_docs:
            if len(papers) >= max_papers:
                break
            if _paper_source_group(doc) != source_group:
                continue
            group_selected = sum(
                1 for row in papers if str(row.get("source_group") or "") == source_group
            )
            if group_selected >= per_group_limit:
                continue
            _append_paper_doc(papers, paper_ids, doc)
        if len(papers) >= max_papers:
            break
    for doc in paper_docs:
        if len(papers) >= max_papers:
            break
        _append_paper_doc(papers, paper_ids, doc)

    company: list[dict[str, str]] = []
    company_ids: set[str] = set()
    for cat in ("company", "company_kr", "company_cn"):
        for doc in category_docs.get(cat, []):
            cl = (doc.get("labels") or {}).get("company", {})
            if cl.get("decision") != "keep":
                continue
            company.append(
                {
                    "title": _title(doc),
                    "domain": cl.get("company_domain") or "others",
                    "source": str(doc.get("source") or ""),
                }
            )
            company_ids.add(str(doc.get("document_id") or ""))
            if len(company) >= max_company:
                break
        if len(company) >= max_company:
            break

    community: list[dict[str, str]] = []
    community_ids: set[str] = set()
    for doc in category_docs.get("community", [])[:5]:
        _append_community_doc(community, community_ids, doc)
    for source in ("hf_daily_papers", "hf_trending_models", "hf_models_likes"):
        for doc in source_docs.get(source, [])[:1]:
            _append_community_doc(community, community_ids, doc)
            if len(community) >= max_community:
                break
        if len(community) >= max_community:
            break
    for doc in category_docs.get("community", [])[5:]:
        _append_community_doc(community, community_ids, doc)
        if len(community) >= max_community:
            break
    for source in ("hf_daily_papers", "hf_trending_models", "hf_models_likes"):
        for doc in source_docs.get(source, [])[1:]:
            _append_community_doc(community, community_ids, doc)
            if len(community) >= max_community:
                break
        if len(community) >= max_community:
            break

    models: list[dict[str, Any]] = []
    model_ids: set[str] = set()
    for source, per_source_limit in (
        ("hf_trending_models", 3),
        ("hf_models_new", 2),
        ("hf_models_likes", 1),
    ):
        for doc in source_docs.get(source, [])[:per_source_limit]:
            document_id = str(doc.get("document_id") or "")
            if not document_id or document_id in model_ids or len(models) >= max_models:
                continue
            discovery = doc.get("discovery") or {}
            ranking = doc.get("ranking") or {}
            metadata = doc.get("metadata") or {}
            models.append(
                {
                    "title": _title(doc),
                    "source": str(doc.get("source") or ""),
                    "likes": _engagement_value(doc),
                    "downloads": _engagement_metric(doc, "downloads"),
                    "feed_score": int(ranking.get("feed_score") or 0),
                    "signal_reason": str(ranking.get("priority_reason") or ""),
                    "discovery_reason": str(discovery.get("primary_reason") or ""),
                    "freshness": str(discovery.get("freshness_bucket") or ""),
                    "trend_rank": metadata.get("trending_position"),
                }
            )
            model_ids.add(document_id)
        if len(models) >= max_models:
            break
    for doc in category_docs.get("models", []):
        document_id = str(doc.get("document_id") or "")
        if not document_id or document_id in model_ids or len(models) >= max_models:
            continue
        discovery = doc.get("discovery") or {}
        ranking = doc.get("ranking") or {}
        metadata = doc.get("metadata") or {}
        models.append(
            {
                "title": _title(doc),
                "source": str(doc.get("source") or ""),
                "likes": _engagement_value(doc),
                "downloads": _engagement_metric(doc, "downloads"),
                "feed_score": int(ranking.get("feed_score") or 0),
                "signal_reason": str(ranking.get("priority_reason") or ""),
                "discovery_reason": str(discovery.get("primary_reason") or ""),
                "freshness": str(discovery.get("freshness_bucket") or ""),
                "trend_rank": metadata.get("trending_position"),
            }
        )
        model_ids.add(document_id)

    total_selected_ids = paper_ids | company_ids | model_ids | community_ids

    session = {
        "window": "today",
        "total_items": len(total_selected_ids),
        "category_counts": {
            "papers": len(papers),
            "company": len(company),
            "models": len(models),
            "community": len(community),
        },
        "dominant_paper_domains": _top_values(papers, "domain"),
        "paper_source_groups": _top_values(papers, "source_group"),
        "dominant_company_domains": _top_values(company, "domain"),
        "company_issue_domains": _top_values(
            [row for row in company if str(row.get("domain") or "") in issue_domains],
            "domain",
        ),
        "top_model_names": [row["title"] for row in models[:2]],
        "active_model_sources": _top_values(models, "source", limit=3),
        "hf_model_sources": _top_values(
            [row for row in models if str(row.get("source") or "").startswith("hf_")],
            "source",
            limit=3,
        ),
        "model_signal_reasons": _top_values(models, "signal_reason", limit=3),
        "active_community_sources": _top_values(community, "source", limit=2),
        "hf_community_sources": _top_values(
            [row for row in community if str(row.get("source") or "").startswith("hf_")],
            "source",
            limit=3,
        ),
    }

    return {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "session": session,
        "papers": papers,
        "company": company,
        "community": community,
        "models": models,
    }


def build_dashboard_payload(
    *,
    session_id: str,
    meta: dict[str, Any],
    run_manifest: dict[str, Any],
    source_manifest: list[dict[str, Any]],
    documents_by_id: dict[str, dict[str, Any]],
    feed_lists: dict[str, list[str]],
    digests_by_category: dict[str, dict[str, Any]] | None = None,
    briefing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    digests_by_category = digests_by_category or {}
    source_manifest_lookup = {
        entry["source"]: entry for entry in source_manifest if entry.get("source")
    }

    feeds: list[dict[str, Any]] = []
    category_documents: dict[str, list[dict[str, Any]]] = {
        category: [] for category in ORDERED_SOURCE_CATEGORIES
    }

    for source, document_ids in sorted(feed_lists.items()):
        documents = [
            documents_by_id[document_id]
            for document_id in document_ids
            if document_id in documents_by_id
        ]
        if not documents:
            continue
        top_document = documents[0]
        category = str(top_document.get("source_category") or "community")
        category_documents.setdefault(category, []).extend(documents)
        manifest_entry = source_manifest_lookup.get(source, {})
        feeds.append(
            {
                "id": source,
                "title": prettify_source_name(source),
                "eyebrow": SOURCE_CATEGORY_LABELS.get(category, category),
                "sourceNote": (manifest_entry.get("notes") or [None])[0]
                or f"{prettify_doc_type(top_document.get('doc_type'))} / {build_document_note(top_document)}",
                "items": [build_feed_item(document) for document in documents[:3]],
            }
        )

    digests = []
    for category in ORDERED_SOURCE_CATEGORIES:
        digest = digests_by_category.get(category) or build_placeholder_digest(
            category,
            sort_documents(category_documents.get(category, [])),
        )
        digests.append(
            {
                "id": digest["id"],
                "domain": digest["domain"],
                "headline": digest["headline"],
                "summary": digest["summary"],
                "evidence": digest["evidence"],
            }
        )

    hottest_category = max(
        ORDERED_SOURCE_CATEGORIES,
        key=lambda category: document_sort_key(
            sort_documents(category_documents.get(category, []))[0]
        )
        if category_documents.get(category)
        else (-1.0, ""),
        default="papers",
    )
    hottest_digest = digests_by_category.get(hottest_category) or build_placeholder_digest(
        hottest_category,
        sort_documents(category_documents.get(hottest_category, [])),
    )

    return {
        "brand": {
            "name": "BLACKSITE",
            "tagline": "Signal Relay",
        },
        "status": meta.get("status") or "published",
        "session": build_session_block(
            session_id, meta, run_manifest, source_manifest, documents_by_id
        ),
        "summary": {
            "title": "Signal Sweep",
            "headline": f"{hottest_digest['domain']} / {hottest_digest['headline']}",
            "briefing": briefing if briefing and not briefing.get("error") else None,
            "digests": digests,
        },
        "feeds": feeds,
    }


def get_feed_lists(
    store: RedisLike, session_id: str, source_ids: Iterable[str]
) -> dict[str, list[str]]:
    return {
        source: store.lrange(feed_key(session_id, source), 0, -1)
        for source in source_ids
        if store.lrange(feed_key(session_id, source), 0, -1)
    }


def get_documents_by_id(
    store: RedisLike, session_id: str, feed_lists: dict[str, list[str]]
) -> dict[str, dict[str, Any]]:
    document_ids = {document_id for ids in feed_lists.values() for document_id in ids}
    documents: dict[str, dict[str, Any]] = {}
    for document_id in document_ids:
        document = get_json(store, doc_key(session_id, document_id))
        if document is not None:
            documents[document_id] = document
    return documents


def get_digest_map(store: RedisLike, session_id: str) -> dict[str, dict[str, Any]]:
    digests: dict[str, dict[str, Any]] = {}
    for category in ORDERED_SOURCE_CATEGORIES:
        digest = get_json(store, digest_key(session_id, category))
        if digest is not None:
            digests[category] = digest
    return digests


def needs_dashboard_rebuild(
    meta: dict[str, Any] | None, dashboard: dict[str, Any] | None
) -> bool:
    if dashboard is None:
        return True
    if not isinstance(meta, dict):
        return False
    return int(meta.get("schema_version") or 0) != SCHEMA_VERSION


def rebuild_dashboard(store: RedisLike, session_id: str) -> dict[str, Any]:
    meta = get_json(store, session_key(session_id, "meta"))
    run_manifest = get_json(store, session_key(session_id, "run_manifest"))
    source_manifest = get_json(store, session_key(session_id, "source_manifest")) or []
    briefing = get_json(store, session_key(session_id, "briefing"))
    if meta is None or run_manifest is None:
        raise KeyError(f"Unknown session: {session_id}")
    if int(meta.get("schema_version") or 0) != SCHEMA_VERSION:
        meta = {**meta, "schema_version": SCHEMA_VERSION}
        set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    source_ids = meta.get("source_ids") or [
        entry.get("source") for entry in source_manifest if entry.get("source")
    ]
    feed_lists = get_feed_lists(store, session_id, source_ids)
    documents_by_id = get_documents_by_id(store, session_id, feed_lists)
    digests_by_category = get_digest_map(store, session_id)
    dashboard = build_dashboard_payload(
        session_id=session_id,
        meta=meta,
        run_manifest=run_manifest,
        source_manifest=source_manifest,
        documents_by_id=documents_by_id,
        feed_lists=feed_lists,
        digests_by_category=digests_by_category,
        briefing=briefing,
    )
    set_json_with_ttl(store, session_key(session_id, "dashboard"), dashboard)
    return dashboard


def load_dashboard(store: RedisLike, session_id: str) -> dict[str, Any]:
    meta = get_json(store, session_key(session_id, "meta"))
    dashboard = get_json(store, session_key(session_id, "dashboard"))
    if not needs_dashboard_rebuild(meta, dashboard):
        return dashboard
    return rebuild_dashboard(store, session_id)


def resolve_session_id(store: RedisLike, session: str | None) -> str:
    target = session or "active"
    if target == "active":
        session_id = store.get(ACTIVE_SESSION_KEY)
        if not session_id:
            raise KeyError("No active session found.")
        return session_id
    return target



def select_summary_candidate_ids(
    documents: list[dict[str, Any]], *, limit_per_category: int = 8
) -> set[str]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for document in sort_documents(documents):
        if not has_displayable_reference(document):
            continue
        if not (document.get("summary_input_text") or "").strip():
            continue
        if document.get("text_scope") == "empty":
            continue
        category = str(document.get("source_category") or "community")
        grouped.setdefault(category, [])
        if len(grouped[category]) >= limit_per_category:
            continue
        grouped[category].append(document)
    return {
        document["document_id"]
        for documents_for_category in grouped.values()
        for document in documents_for_category
    }


def ensure_llm_status(
    document: dict[str, Any], candidate_ids: set[str]
) -> dict[str, Any]:
    normalized = deepcopy(document)
    llm = default_llm_state()
    llm.update(normalized.get("llm") or {})
    llm["status"] = (
        "pending" if normalized["document_id"] in candidate_ids else "not_selected"
    )
    normalized["llm"] = llm
    return normalized


def publish_run(
    store: RedisLike,
    run_dir: str | Path,
    *,
    queue: bool = True,
) -> dict[str, Any]:
    artifacts = load_run_artifacts(run_dir)
    session_id = str(artifacts.run_manifest["run_id"])

    company_lookup: dict[str, dict[str, Any]] = {
        row["document_id"]: row
        for row in artifacts.company_decisions
        if row.get("document_id")
    }
    paper_lookup: dict[str, str] = {
        row["document_id"]: row.get("paper_domain", "others")
        for row in artifacts.paper_domains
        if row.get("document_id")
    }
    for document in artifacts.documents:
        doc_id = document.get("document_id", "")
        labels: dict[str, Any] = {}
        if doc_id in company_lookup:
            cd = company_lookup[doc_id]
            labels["company"] = {
                "decision": cd.get("decision"),
                "company_domain": cd.get("company_domain"),
                "reason_code": cd.get("reason_code"),
            }
        if doc_id in paper_lookup:
            labels["paper_domain"] = paper_lookup[doc_id]
        if labels:
            document["labels"] = labels

    filtered_documents = [
        document for document in artifacts.documents if has_displayable_reference(document)
    ]
    candidate_ids = select_summary_candidate_ids(filtered_documents)
    documents = [
        ensure_llm_status(document, candidate_ids) for document in filtered_documents
    ]

    documents_by_source: dict[str, list[dict[str, Any]]] = {}
    for document in documents:
        documents_by_source.setdefault(str(document.get("source")), []).append(document)
    for source in list(documents_by_source):
        documents_by_source[source] = sort_documents(documents_by_source[source])

    source_ids = sorted(documents_by_source)
    meta = {
        "schema_version": SCHEMA_VERSION,
        "session_id": session_id,
        "run_id": session_id,
        "status": "published",
        "created_at": now_utc_iso(),
        "updated_at": now_utc_iso(),
        "docs_total": len(documents),
        "feeds_ready": True,
        "digests_ready": False,
        "summaries_ready": 0,
        "summary_candidates": len(candidate_ids),
        "source_ids": source_ids,
    }

    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    set_json_with_ttl(store, artifact_root_key(session_id), str(artifacts.run_dir))
    set_json_with_ttl(
        store, session_key(session_id, "run_manifest"), artifacts.run_manifest
    )
    set_json_with_ttl(
        store, session_key(session_id, "source_manifest"), artifacts.source_manifest
    )

    for document in documents:
        set_json_with_ttl(store, doc_key(session_id, document["document_id"]), document)

    feed_lists = {
        source: [document["document_id"] for document in documents_for_source]
        for source, documents_for_source in documents_by_source.items()
    }
    for source, document_ids in feed_lists.items():
        set_list_with_ttl(store, feed_key(session_id, source), document_ids)

    dashboard = build_dashboard_payload(
        session_id=session_id,
        meta=meta,
        run_manifest=artifacts.run_manifest,
        source_manifest=artifacts.source_manifest,
        documents_by_id={document["document_id"]: document for document in documents},
        feed_lists=feed_lists,
        digests_by_category={},
    )
    set_json_with_ttl(store, session_key(session_id, "dashboard"), dashboard)
    store.set(ACTIVE_SESSION_KEY, session_id)
    prune_stale_sessions(store, session_id)

    if queue:
        enqueue_session_for_enrichment(store, session_id)

    return {
        "session_id": session_id,
        "meta": meta,
        "dashboard": dashboard,
    }


def enqueue_session_for_enrichment(store: RedisLike, session_id: str) -> None:
    store.rpush(QUEUE_SESSION_ENRICH_KEY, json_dumps({"session_id": session_id}))


def dequeue_session_for_enrichment(store: RedisLike) -> str | None:
    payload = store.lpop(QUEUE_SESSION_ENRICH_KEY)
    if payload is None:
        return None
    decoded = json_loads(payload)
    if not isinstance(decoded, dict):
        return None
    session_id = decoded.get("session_id")
    return str(session_id) if session_id else None


LLM_ENRICH_DIR = ROOT_DIR / "pipelines" / "llm_enrich" / "scripts"


def _ollama_reachable() -> bool:
    """Quick check whether Ollama API is up."""
    try:
        import httpx

        resp = httpx.get(f"{OLLAMA_BASE_URL.rstrip('/')}/api/tags", timeout=3.0)
        return resp.status_code == 200
    except Exception:
        return False


def _run_llm_enrich_script(script_name: str, run_dir: Path) -> bool:
    """Run an offline LLM enrichment script against a run directory.

    Returns True on success, False on any failure (non-blocking).
    """
    script_path = LLM_ENRICH_DIR / script_name
    if not script_path.exists():
        return False
    try:
        result = subprocess.run(
            [sys.executable, str(script_path), "--run-dir", str(run_dir)],
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode != 0:
            logger.warning(
                "LLM enrich %s failed (exit %d): %s",
                script_name,
                result.returncode,
                result.stderr[:500],
            )
            return False
        return True
    except Exception as exc:
        logger.warning("LLM enrich %s error: %s", script_name, exc)
        return False


def run_offline_llm_enrichment(
    store: RedisLike,
    session_id: str,
    run_dir: Path,
) -> bool:
    """Run company filter + paper domain classifier, then re-merge labels
    into Redis documents. Returns True if any labels were produced."""
    if not _ollama_reachable():
        return False

    logger.info("Running offline LLM enrichment for session %s", session_id)
    company_ok = _run_llm_enrich_script("llm_enrich.py", run_dir)
    paper_ok = _run_llm_enrich_script("paper_enrich.py", run_dir)
    if not company_ok and not paper_ok:
        return False

    # Re-read labels and merge into Redis documents
    labels_dir = run_dir / "labels"
    company_decisions = read_ndjson(labels_dir / "company_decisions.ndjson")
    paper_domains = read_ndjson(labels_dir / "paper_domains.ndjson")
    if not company_decisions and not paper_domains:
        return False

    company_lookup: dict[str, dict[str, Any]] = {
        row["document_id"]: row
        for row in company_decisions
        if row.get("document_id")
    }
    paper_lookup: dict[str, str] = {
        row["document_id"]: row.get("paper_domain", "others")
        for row in paper_domains
        if row.get("document_id")
    }

    source_ids = (get_json(store, session_key(session_id, "meta")) or {}).get(
        "source_ids", []
    )
    feed_lists = get_feed_lists(store, session_id, source_ids)
    updated = 0
    for source in source_ids:
        for doc_id in feed_lists.get(source, []):
            doc = get_json(store, doc_key(session_id, doc_id))
            if doc is None:
                continue
            labels: dict[str, Any] = doc.get("labels") or {}
            changed = False
            if doc_id in company_lookup:
                cd = company_lookup[doc_id]
                labels["company"] = {
                    "decision": cd.get("decision"),
                    "company_domain": cd.get("company_domain"),
                    "reason_code": cd.get("reason_code"),
                }
                changed = True
            if doc_id in paper_lookup:
                labels["paper_domain"] = paper_lookup[doc_id]
                changed = True
            if changed:
                doc["labels"] = labels
                set_json_with_ttl(store, doc_key(session_id, doc_id), doc)
                updated += 1

    logger.info(
        "LLM enrichment merged: %d company, %d paper, %d docs updated",
        len(company_decisions),
        len(paper_domains),
        updated,
    )
    return True


def run_session_enrichment(
    store: RedisLike,
    session_id: str,
    *,
    generator: SummaryGenerator | None = None,
    briefing_generator: BriefingGenerator | None = None,
) -> dict[str, Any]:
    generator = generator or build_summary_generator()
    owns_briefing_generator = briefing_generator is None
    if briefing_generator is None:
        briefing_generator = build_briefing_generator()
    meta = get_json(store, session_key(session_id, "meta"))
    run_manifest = get_json(store, session_key(session_id, "run_manifest"))
    source_manifest = get_json(store, session_key(session_id, "source_manifest")) or []
    if meta is None or run_manifest is None:
        raise KeyError(f"Unknown session: {session_id}")

    source_ids = meta.get("source_ids") or [
        entry.get("source") for entry in source_manifest if entry.get("source")
    ]
    feed_lists = get_feed_lists(store, session_id, source_ids)
    documents_by_id = get_documents_by_id(store, session_id, feed_lists)
    pending_document_ids = [
        document_id
        for source in source_ids
        for document_id in feed_lists.get(source, [])
        if (documents_by_id.get(document_id, {}).get("llm") or {}).get("status") == "pending"
    ]
    pending_total = len(pending_document_ids)
    provider_name = getattr(generator, "provider_name", generator.__class__.__name__)
    summary_generation_enabled = provider_name != "noop"

    meta["status"] = "summarizing"
    meta["summary_provider"] = provider_name
    meta["updated_at"] = now_utc_iso()
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)

    summary_errors = 0
    summaries_ready = 0
    processed_summaries = 0
    category_documents: dict[str, list[dict[str, Any]]] = {
        category: [] for category in ORDERED_SOURCE_CATEGORIES
    }

    for source in source_ids:
        for document_id in feed_lists.get(source, []):
            document = documents_by_id.get(document_id)
            if document is None:
                continue
            category = str(document.get("source_category") or "community")
            category_documents.setdefault(category, []).append(document)
            if not summary_generation_enabled:
                continue
            llm = default_llm_state()
            llm.update(document.get("llm") or {})
            if llm.get("status") != "pending":
                continue
            try:
                llm.update(generator.summarize_document(document))
                if not llm.get("status"):
                    llm["status"] = "complete"
                if llm.get("status") == "complete":
                    summaries_ready += 1
                elif llm.get("status") == "error":
                    summary_errors += 1
            except Exception as exc:  # pragma: no cover
                summary_errors += 1
                llm["status"] = "error"
                llm["importance_reason"] = str(exc)
                llm["run_meta"] = {
                    "model_name": getattr(generator, "model_name", "unknown"),
                    "prompt_version": getattr(generator, "prompt_version", "unknown"),
                    "fewshot_pack_version": getattr(
                        generator, "fewshot_pack_version", "unknown"
                    ),
                    "generated_at": now_utc_iso(),
                }
            processed_summaries += 1
            document["llm"] = llm
            documents_by_id[document_id] = document
            set_json_with_ttl(store, doc_key(session_id, document_id), document)

    digests_by_category: dict[str, dict[str, Any]] = {}
    for category in ORDERED_SOURCE_CATEGORIES:
        documents = sort_documents(category_documents.get(category, []))
        digest = build_digest_from_documents(category, documents)
        digests_by_category[category] = digest
        set_json_with_ttl(store, digest_key(session_id, category), digest)

    # --- offline LLM enrichment (company filter + paper domain) ---
    run_dir_str = store.get(artifact_root_key(session_id))
    if run_dir_str:
        enriched = run_offline_llm_enrichment(store, session_id, Path(run_dir_str))
        if enriched:
            # Reload documents after label merge so briefing sees domains
            documents_by_id = get_documents_by_id(store, session_id, feed_lists)

    briefing: dict[str, Any] | None = None
    if briefing_generator is not None:
        briefing_input = build_briefing_input(documents_by_id, feed_lists)
        briefing = briefing_generator.generate_briefing(briefing_input)
        set_json_with_ttl(store, session_key(session_id, "briefing"), briefing)

    meta["digests_ready"] = True
    meta["summaries_ready"] = summaries_ready
    meta["updated_at"] = now_utc_iso()
    meta["status"] = "partial_error" if summary_errors else "ready"
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)

    dashboard = build_dashboard_payload(
        session_id=session_id,
        meta=meta,
        run_manifest=run_manifest,
        source_manifest=source_manifest,
        documents_by_id=documents_by_id,
        feed_lists=feed_lists,
        digests_by_category=digests_by_category,
        briefing=briefing,
    )
    set_json_with_ttl(store, session_key(session_id, "dashboard"), dashboard)
    try:
        persist_session_runtime_artifacts(
            resolve_session_artifact_root(store, session_id, run_manifest),
            session_id=session_id,
            run_id=str(run_manifest.get("run_id") or session_id),
            documents_by_id=documents_by_id,
            digests_by_category=digests_by_category,
            briefing=briefing,
            provider_name=provider_name,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "Failed to persist runtime summary artifacts for %s: %s",
            session_id,
            exc,
        )
    if owns_briefing_generator and briefing_generator is not None:
        close = getattr(briefing_generator, "close", None)
        if callable(close):
            close()
    return {
        "session_id": session_id,
        "meta": meta,
        "dashboard": dashboard,
    }


def process_enrichment_queue(
    store: RedisLike,
    *,
    generator: Any | None = None,
    once: bool = False,
) -> list[dict[str, Any]]:
    processed: list[dict[str, Any]] = []
    while True:
        session_id = dequeue_session_for_enrichment(store)
        if session_id is None:
            return processed
        processed.append(
            run_session_enrichment(store, session_id, generator=generator)
        )
        if once:
            return processed


def run_homepage_bootstrap(
    store: RedisLike,
    *,
    run_label: str = HOMEPAGE_BOOTSTRAP_RUN_LABEL,
    timeout: float = 30.0,
) -> None:
    try:
        _, run_dir = collect_run(
            run_label=run_label,
            timeout=timeout,
        )
        result = publish_run(store, run_dir, queue=False)
        run_session_enrichment(store, result["session_id"])
    except Exception:
        logger.exception("Error during homepage bootstrap")
    finally:
        set_homepage_bootstrap_running(False)


def run_session_reload(
    store: RedisLike,
    *,
    sources: list[str] | None = None,
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
) -> None:
    try:
        _, run_dir = collect_run(
            sources=sources,
            limit=limit,
            output_dir=output_dir,
            run_label=run_label,
            timeout=timeout,
        )
        result = publish_run(store, run_dir, queue=False)
        run_session_enrichment(store, result["session_id"])
    except Exception:
        logger.exception("Error during session reload")
    finally:
        set_session_reload_running(False)



def start_session_reload(
    store: RedisLike,
    *,
    schedule_reload: Callable[[], None],
) -> dict[str, Any]:
    if is_session_reload_running():
        return {"session_id": None, "status": "collecting", "error": None}

    set_session_reload_running(True)
    try:
        schedule_reload()
    except Exception:
        set_session_reload_running(False)
        raise
    return {"session_id": None, "status": "collecting", "error": None}


def get_dashboard_response(
    store: RedisLike, session: str | None = None
) -> dict[str, Any]:
    session_id = resolve_session_id(store, session)
    return load_dashboard(store, session_id)


def build_leaderboard_response_from_dashboard(
    dashboard: dict[str, Any],
) -> dict[str, Any]:
    session = dashboard.get("session") or {}
    return {
        "sessionId": session.get("sessionId"),
        "status": dashboard.get("status"),
        "leaderboard": session.get("arenaOverview"),
    }


def get_leaderboard_response(
    store: RedisLike, session: str | None = None
) -> dict[str, Any]:
    session_id = resolve_session_id(store, session)
    dashboard = get_json(store, session_key(session_id, "dashboard"))
    if dashboard is not None:
        leaderboard = ((dashboard.get("session") or {}).get("arenaOverview"))
        if leaderboard is not None:
            return build_leaderboard_response_from_dashboard(dashboard)

        # Rebuild stale materialized dashboards created before leaderboard support.
        dashboard = rebuild_dashboard(store, session_id)
        leaderboard = ((dashboard.get("session") or {}).get("arenaOverview"))
        if leaderboard is not None:
            return build_leaderboard_response_from_dashboard(dashboard)

    meta = get_json(store, session_key(session_id, "meta"))
    run_manifest = get_json(store, session_key(session_id, "run_manifest"))
    source_manifest = get_json(store, session_key(session_id, "source_manifest")) or []
    if meta is None or run_manifest is None:
        raise KeyError(f"Unknown session: {session_id}")

    source_ids = meta.get("source_ids") or [
        entry.get("source") for entry in source_manifest if entry.get("source")
    ]
    feed_lists = get_feed_lists(store, session_id, source_ids)
    documents_by_id = get_documents_by_id(store, session_id, feed_lists)
    return {
        "sessionId": session_id,
        "status": meta.get("status") or "published",
        "leaderboard": build_lmarena_session_overview(documents_by_id),
    }


def get_digest_response(
    store: RedisLike, digest_id: str, *, session: str | None = None
) -> dict[str, Any]:
    session_id = resolve_session_id(store, session)
    meta = get_json(store, session_key(session_id, "meta"))
    run_manifest = get_json(store, session_key(session_id, "run_manifest"))
    source_manifest = get_json(store, session_key(session_id, "source_manifest")) or []
    if meta is None or run_manifest is None:
        raise KeyError(f"Unknown session: {session_id}")

    digest = get_json(store, digest_key(session_id, digest_id))
    if digest is None:
        source_ids = meta.get("source_ids") or [
            entry.get("source") for entry in source_manifest if entry.get("source")
        ]
        feed_lists = get_feed_lists(store, session_id, source_ids)
        documents_by_id = get_documents_by_id(store, session_id, feed_lists)
        documents = sort_documents(
            document
            for document in documents_by_id.values()
            if document.get("source_category") == digest_id
        )
        digest = build_placeholder_digest(digest_id, documents)

    documents = [
        get_json(store, doc_key(session_id, document_id))
        for document_id in digest.get("document_ids", [])
    ]
    return {
        "sessionId": session_id,
        "status": meta.get("status"),
        "digest": {
            "id": digest["id"],
            "domain": digest["domain"],
            "headline": digest["headline"],
            "summary": digest["summary"],
            "evidence": digest["evidence"],
            "documentIds": digest.get("document_ids", []),
            "updatedAt": digest.get("updated_at"),
        },
        "documents": [document for document in documents if document is not None],
    }


def get_document_response(
    store: RedisLike, document_id: str, *, session: str | None = None
) -> dict[str, Any]:
    session_id = resolve_session_id(store, session)
    document = get_json(store, doc_key(session_id, document_id))
    if document is None:
        raise KeyError(f"Unknown document: {document_id}")
    return document


def reload_session(
    store: RedisLike,
    *,
    sources: list[str] | None = None,
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
    queue: bool = True,
) -> dict[str, Any]:
    _, run_dir = collect_run(
        sources=sources,
        limit=limit,
        output_dir=output_dir,
        run_label=run_label,
        timeout=timeout,
    )
    return publish_run(store, run_dir, queue=queue)
