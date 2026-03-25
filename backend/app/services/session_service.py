from __future__ import annotations

import json
import re
import threading
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from ..core.constants import (
    ACTIVE_SESSION_KEY,
    BOOTSTRAP_STATE_KEY,
    BOOTSTRAP_STATE_TTL_SECONDS,
    DEFAULT_COLLECTION_PROFILE,
    DEFAULT_RUN_LABEL,
    HOMEPAGE_BOOTSTRAP_RUN_LABEL,
    ORDERED_SOURCE_CATEGORIES,
    QUEUE_SESSION_ENRICH_KEY,
    RELOAD_STATE_KEY,
    RELOAD_STATE_TTL_SECONDS,
    SCHEMA_VERSION,
    SESSION_PREFIX,
    SESSION_TTL_SECONDS,
    SOURCE_CATEGORY_LABELS,
)
from ..core.store import RedisLike
from .collector import collect_run
from .summary_provider import SummaryGenerator, build_summary_generator


@dataclass(frozen=True)
class RunArtifacts:
    run_dir: Path
    run_manifest: dict[str, Any]
    source_manifest: list[dict[str, Any]]
    documents: list[dict[str, Any]]


_HOMEPAGE_BOOTSTRAP_LOCK = threading.Lock()
_HOMEPAGE_BOOTSTRAP_RUNNING = False
_SESSION_RELOAD_LOCK = threading.Lock()
_SESSION_RELOAD_RUNNING = False


def now_utc_iso() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def session_key(session_id: str, suffix: str) -> str:
    return f"{SESSION_PREFIX}:{session_id}:{suffix}"


def set_homepage_bootstrap_running(is_running: bool) -> None:
    global _HOMEPAGE_BOOTSTRAP_RUNNING
    with _HOMEPAGE_BOOTSTRAP_LOCK:
        _HOMEPAGE_BOOTSTRAP_RUNNING = is_running


def is_homepage_bootstrap_running() -> bool:
    with _HOMEPAGE_BOOTSTRAP_LOCK:
        return _HOMEPAGE_BOOTSTRAP_RUNNING


def reset_homepage_bootstrap_state(store: RedisLike | None = None) -> None:
    set_homepage_bootstrap_running(False)
    if store is not None:
        store.delete(BOOTSTRAP_STATE_KEY)


def set_session_reload_running(is_running: bool) -> None:
    global _SESSION_RELOAD_RUNNING
    with _SESSION_RELOAD_LOCK:
        _SESSION_RELOAD_RUNNING = is_running


def is_session_reload_running() -> bool:
    with _SESSION_RELOAD_LOCK:
        return _SESSION_RELOAD_RUNNING


def reset_session_reload_state(
    store: RedisLike | None = None,
    *,
    clear_state: bool = True,
) -> None:
    set_session_reload_running(False)
    if store is not None and clear_state:
        store.delete(RELOAD_STATE_KEY)


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


def load_run_artifacts(run_dir: str | Path) -> RunArtifacts:
    root = Path(run_dir)
    normalized_dir = root / "normalized"
    return RunArtifacts(
        run_dir=root,
        run_manifest=read_json(root / "run_manifest.json"),
        source_manifest=read_ndjson(root / "source_manifest.ndjson"),
        documents=read_ndjson(normalized_dir / "documents.ndjson"),
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


def set_bootstrap_state(store: RedisLike, payload: dict[str, Any]) -> None:
    set_json_with_ttl(
        store,
        BOOTSTRAP_STATE_KEY,
        payload,
        ttl=BOOTSTRAP_STATE_TTL_SECONDS,
    )


def get_bootstrap_state(store: RedisLike) -> dict[str, Any] | None:
    payload = get_json(store, BOOTSTRAP_STATE_KEY)
    return payload if isinstance(payload, dict) else None


def set_reload_state(store: RedisLike, payload: dict[str, Any]) -> None:
    set_json_with_ttl(
        store,
        RELOAD_STATE_KEY,
        payload,
        ttl=RELOAD_STATE_TTL_SECONDS,
    )


def get_reload_state(store: RedisLike) -> dict[str, Any] | None:
    payload = get_json(store, RELOAD_STATE_KEY)
    return payload if isinstance(payload, dict) else None


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
    "benchmark": "Leaderboard Row",
    "benchmark_panel": "Leaderboard Panel",
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
                benchmark.get("board_name") or "Leaderboard",
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


def loading_stage_label(stage: str, status: str) -> str:
    labels = {
        "starting": "요청 준비",
        "fetching_sources": "Source 수집",
        "writing_artifacts": "정규화/산출물 저장",
        "publishing_session": "Redis publish",
        "publishing_documents": "문서 publish",
        "publishing_views": "피드/대시보드 publish",
        "published": "Publish 완료",
        "summarizing_documents": "문서 요약",
        "building_digests": "Digest 생성",
        "ready": "세션 준비 완료",
        "partial_error": "부분 완료",
        "error": "실패",
    }
    if status == "partial_error":
        return labels["partial_error"]
    return labels.get(stage, labels.get(status, "진행 중"))


def loading_step_statuses(stage: str, status: str) -> list[dict[str, str]]:
    steps = [
        {
            "id": "prepare",
            "label": "Prepare",
            "detail": "요청을 받고 source 범위와 실행 파라미터를 확정합니다.",
        },
        {
            "id": "collect",
            "label": "Collect",
            "detail": "source_fetch가 source별 원문을 실제로 수집합니다.",
        },
        {
            "id": "normalize",
            "label": "Normalize",
            "detail": "manifest와 normalized 산출물을 run 디렉터리에 기록합니다.",
        },
        {
            "id": "publish-docs",
            "label": "Publish Docs",
            "detail": "displayable document를 Redis doc 키로 올립니다.",
        },
        {
            "id": "publish-views",
            "label": "Publish Views",
            "detail": "feed, dashboard, active session view를 갱신합니다.",
        },
        {
            "id": "summarize",
            "label": "Summarize",
            "detail": "선택된 문서를 요약해 summary field를 채웁니다.",
        },
        {
            "id": "digest",
            "label": "Digests",
            "detail": "category digest를 생성하고 마무리 상태를 기록합니다.",
        },
    ]

    current_index = {
        "starting": 0,
        "fetching_sources": 1,
        "writing_artifacts": 2,
        "publishing_session": 3,
        "publishing_documents": 3,
        "publishing_views": 4,
        "published": 4,
        "summarizing_documents": 5,
        "building_digests": 6,
        "ready": 6,
        "partial_error": 6,
        "error": 0,
    }.get(stage, 0)

    error_index = current_index if status == "error" else None
    completed_through = {
        "starting": -1,
        "fetching_sources": 0,
        "writing_artifacts": 1,
        "publishing_session": 2,
        "publishing_documents": 2,
        "publishing_views": 3,
        "published": 4,
        "summarizing_documents": 4,
        "building_digests": 5,
        "ready": 6,
        "partial_error": 6,
        "error": -1,
    }.get(stage, -1)

    resolved_steps: list[dict[str, str]] = []
    for index, step in enumerate(steps):
        step_status = "pending"
        if error_index is not None and index == error_index:
            step_status = "error"
        elif status == "partial_error" and step["id"] == "summarize":
            step_status = "error"
        elif index <= completed_through:
            step_status = "complete"
        elif index == current_index:
            step_status = "active"
        resolved_steps.append({**step, "status": step_status})
    return resolved_steps


def loading_percent(current: int, total: int, *, status: str, stage: str) -> int:
    stage_ranges: dict[str, tuple[int, int]] = {
        "starting": (0, 4),
        "fetching_sources": (5, 55),
        "writing_artifacts": (56, 64),
        "publishing_session": (65, 72),
        "publishing_documents": (65, 72),
        "publishing_views": (73, 84),
        "published": (84, 84),
        "summarizing_documents": (85, 94),
        "building_digests": (95, 99),
        "ready": (100, 100),
        "partial_error": (100, 100),
    }

    def stage_based_percent(stage_start: int, stage_end: int) -> int:
        if stage_end <= stage_start:
            return stage_end
        if total <= 0:
            return stage_start
        bounded = max(0, min(current, total))
        ratio = bounded / total
        return int(round(stage_start + ((stage_end - stage_start) * ratio)))

    if status in {"ready", "partial_error"}:
        return 100
    if stage == "error":
        if total <= 0:
            return 0
        bounded = max(0, min(current, total))
        return int(round((bounded / total) * 100))
    stage_start, stage_end = stage_ranges.get(stage, (0, 0))
    return stage_based_percent(stage_start, stage_end)


def build_loading_block(
    *,
    status: str,
    stage: str,
    detail: str,
    progress_current: int,
    progress_total: int,
    current_source: str | None = None,
) -> dict[str, Any]:
    return {
        "stage": stage,
        "stageLabel": loading_stage_label(stage, status),
        "detail": detail,
        "progressCurrent": progress_current,
        "progressTotal": progress_total,
        "percent": loading_percent(
            progress_current,
            progress_total,
            status=status,
            stage=stage,
        ),
        "currentSource": current_source,
        "steps": loading_step_statuses(stage, status),
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
            "role": "pipelines/source_fetch run 산출물을 기준 아티팩트로 유지합니다.",
            "status": collector_status,
        },
        {
            "name": "enricher",
            "role": "선택된 문서만 요약하고 category digest를 생성합니다.",
            "status": enricher_status,
        },
        {
            "name": "redis",
            "role": "세션용 materialized view를 문서, feed, digest, dashboard 키로 보관합니다.",
            "status": redis_status,
        },
        {
            "name": "ui",
            "role": "BFF를 통해 active session과 drill-down detail을 읽습니다.",
            "status": "live",
        },
    ]


def build_bootstrap_runtime_items(status: str, stage: str) -> list[dict[str, str]]:
    collector_status = "running"
    redis_status = "waiting"
    enricher_status = "queued"
    ui_status = "streaming"

    if stage in {"publishing_session", "publishing_documents", "publishing_views"}:
        collector_status = "completed"
        redis_status = "running"
    elif status == "error":
        collector_status = "error" if stage in {"starting", "fetching_sources", "writing_artifacts"} else "completed"
        redis_status = "error" if stage == "publishing_session" else "waiting"
        enricher_status = "waiting"
        ui_status = "blocked"

    return [
        {
            "name": "collector",
            "role": "홈페이지 첫 진입 시 pipelines/source_fetch collection을 실행합니다.",
            "status": collector_status,
        },
        {
            "name": "enricher",
            "role": "publish 이후 category digest와 문서 요약을 채웁니다.",
            "status": enricher_status,
        },
        {
            "name": "redis",
            "role": "collector 결과가 나오면 active session 키를 채웁니다.",
            "status": redis_status,
        },
        {
            "name": "ui",
            "role": "dashboard SSE stream으로 collecting 상태를 감시합니다.",
            "status": ui_status,
        },
    ]


def build_bootstrap_digest_items(status: str) -> list[dict[str, str]]:
    collecting_summary = "source fetch run이 끝나면 category digest가 채워집니다."
    error_summary = "자동 수집이 실패했습니다. 페이지를 새로고침하거나 reload를 다시 시도해 주세요."
    summary = collecting_summary if status == "collecting" else error_summary
    evidence = "pending" if status == "collecting" else "error"
    return [
        {
            "id": category,
            "domain": SOURCE_CATEGORY_LABELS.get(category, category),
            "headline": "수집 대기 중" if status == "collecting" else "수집 실패",
            "summary": summary,
            "evidence": evidence,
        }
        for category in ORDERED_SOURCE_CATEGORIES
    ]


def build_bootstrap_dashboard(state: dict[str, Any]) -> dict[str, Any]:
    status = str(state.get("status") or "collecting")
    started_at = str(state.get("started_at") or now_utc_iso())
    profile = str(state.get("profile") or DEFAULT_COLLECTION_PROFILE)
    error_message = compact_text(state.get("error"), 180)
    stage = str(state.get("stage") or "starting")
    detail = str(
        state.get("detail")
        or "실제 데이터를 수집해 Redis session을 준비 중입니다."
    )
    progress_current = int(state.get("progress_current") or 0)
    progress_total = int(state.get("progress_total") or 0)
    current_source = state.get("current_source")
    loading = build_loading_block(
        status=status,
        stage=stage if status != "error" else "error",
        detail=error_message or detail,
        progress_current=progress_current,
        progress_total=progress_total,
        current_source=str(current_source) if current_source else None,
    )
    metrics = [
        {
            "label": "sources",
            "value": (
                f"{progress_current}/{progress_total}"
                if progress_total > 0
                else "all"
            ),
            "note": "홈페이지 진입 시 전체 source collection을 시작합니다.",
        },
        {
            "label": "docs",
            "value": "0",
            "note": detail,
        },
        {
            "label": "digests",
            "value": "pending" if status == "collecting" else "error",
            "note": error_message
            or "collector가 끝나면 summary worker 단계로 이어집니다.",
        },
    ]
    return {
        "brand": {
            "name": "SparkOrbit",
            "tagline": "Homepage Bootstrap",
        },
        "status": status,
        "session": {
            "title": "SparkOrbit Live Bootstrap",
            "sessionId": "bootstrapping",
            "sessionDate": started_at[:10] or "unknown",
            "window": f"{profile} snapshot",
            "reloadRule": "홈페이지에서 active session이 없으면 collector가 자동으로 새 run을 만듭니다.",
            "metrics": metrics,
            "runtime": build_bootstrap_runtime_items(status, stage),
            "rules": [
                "실제 source fetch가 완료될 때까지 collecting 상태를 유지합니다.",
                "run output는 pipelines/source_fetch/data/runs 아래에 계속 저장됩니다.",
                "publish가 끝나면 active session이 교체되고 프론트 SSE stream이 실제 dashboard로 전환됩니다.",
            ],
            "arenaOverview": None,
            "loading": loading,
        },
        "summary": {
            "title": "Category Digest",
            "headline": error_message or detail,
            "digests": build_bootstrap_digest_items(status),
        },
        "feeds": [],
    }


def build_session_block(
    session_id: str,
    meta: dict[str, Any],
    run_manifest: dict[str, Any],
    source_manifest: list[dict[str, Any]],
    documents_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    session_date = (meta.get("created_at") or run_manifest.get("started_at") or "")[
        :10
    ]
    digests_ready = "yes" if meta.get("digests_ready") else "no"
    loading_stage = str(meta.get("loading_stage") or meta.get("status") or "published")
    loading_detail = str(
        meta.get("loading_detail")
        or f"현재 session 상태는 {meta.get('status') or 'published'} 입니다."
    )
    loading = build_loading_block(
        status=str(meta.get("status") or "published"),
        stage=loading_stage,
        detail=loading_detail,
        progress_current=int(meta.get("loading_progress_current") or 0),
        progress_total=int(meta.get("loading_progress_total") or 0),
        current_source=(
            str(meta.get("loading_current_source"))
            if meta.get("loading_current_source")
            else None
        ),
    )
    arena_overview = build_lmarena_session_overview(documents_by_id)
    return {
        "title": "SparkOrbit Redis Session",
        "sessionId": session_id,
        "sessionDate": session_date or "unknown",
        "window": f"{run_manifest.get('profile', 'session')} snapshot",
        "reloadRule": "POST /api/sessions/reload가 새 run을 수집하고 Redis session을 교체합니다.",
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
                "note": "현재 session dashboard에 연결된 source 수",
            },
            {
                "label": "docs",
                "value": str(meta.get("docs_total", 0)),
                "note": "displayable reference를 가진 normalized 문서 수",
            },
            {
                "label": "digests",
                "value": digests_ready,
                "note": f"summaries {meta.get('summaries_ready', 0)} / status {meta.get('status')}",
            },
        ],
        "runtime": build_runtime_items(
            str(meta.get("status") or "published"),
            stage=loading_stage,
        ),
        "rules": [
            "JSONL run output를 source of truth로 유지합니다.",
            "Redis는 source별 feed와 dashboard materialized view를 제공합니다.",
            "교차 source mixing은 category digest에서만 수행합니다.",
        ],
        "arenaOverview": arena_overview,
        "loading": loading,
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
        "title": "LMArena Type Rankings",
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
        "headline": top_document.get("title") if top_document else "대표 문서 없음",
        "summary": (
            build_document_note(top_document)
            if top_document
            else "아직 category 문서가 없습니다."
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


def build_dashboard_payload(
    *,
    session_id: str,
    meta: dict[str, Any],
    run_manifest: dict[str, Any],
    source_manifest: list[dict[str, Any]],
    documents_by_id: dict[str, dict[str, Any]],
    feed_lists: dict[str, list[str]],
    digests_by_category: dict[str, dict[str, Any]] | None = None,
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
            "name": "SparkOrbit",
            "tagline": "Redis Session Pipeline",
        },
        "status": meta.get("status") or "published",
        "session": build_session_block(
            session_id, meta, run_manifest, source_manifest, documents_by_id
        ),
        "summary": {
            "title": "Category Digest",
            "headline": f"{hottest_digest['domain']} / {hottest_digest['headline']}",
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


def rebuild_dashboard(store: RedisLike, session_id: str) -> dict[str, Any]:
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
    digests_by_category = get_digest_map(store, session_id)
    dashboard = build_dashboard_payload(
        session_id=session_id,
        meta=meta,
        run_manifest=run_manifest,
        source_manifest=source_manifest,
        documents_by_id=documents_by_id,
        feed_lists=feed_lists,
        digests_by_category=digests_by_category,
    )
    set_json_with_ttl(store, session_key(session_id, "dashboard"), dashboard)
    return dashboard


def load_dashboard(store: RedisLike, session_id: str) -> dict[str, Any]:
    dashboard = get_json(store, session_key(session_id, "dashboard"))
    if dashboard is not None:
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


def begin_homepage_bootstrap(
    store: RedisLike,
    *,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    run_label: str = HOMEPAGE_BOOTSTRAP_RUN_LABEL,
) -> dict[str, Any]:
    global _HOMEPAGE_BOOTSTRAP_RUNNING
    with _HOMEPAGE_BOOTSTRAP_LOCK:
        if _HOMEPAGE_BOOTSTRAP_RUNNING:
            return get_bootstrap_state(store) or build_homepage_bootstrap_state(
                status="collecting",
                profile=profile,
                run_label=run_label,
            )
        _HOMEPAGE_BOOTSTRAP_RUNNING = True
        state = build_homepage_bootstrap_state(
            status="collecting",
            profile=profile,
            run_label=run_label,
        )
    set_bootstrap_state(store, state)
    return state


def build_homepage_bootstrap_state(
    *,
    status: str,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    run_label: str = HOMEPAGE_BOOTSTRAP_RUN_LABEL,
    stage: str = "starting",
    detail: str | None = None,
    progress_current: int = 0,
    progress_total: int = 0,
    current_source: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "profile": profile,
        "run_label": run_label,
        "stage": stage,
        "detail": detail
        or (
            "홈페이지 요청을 받아 실제 데이터를 수집하기 시작합니다."
            if status != "error"
            else "자동 수집 중 오류가 발생했습니다."
        ),
        "progress_current": progress_current,
        "progress_total": progress_total,
        "current_source": current_source,
        "started_at": now_utc_iso(),
        "updated_at": now_utc_iso(),
        "error": compact_text(error, 180) or None,
    }


def begin_session_reload(
    store: RedisLike,
    *,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    run_label: str = DEFAULT_RUN_LABEL,
) -> dict[str, Any]:
    global _SESSION_RELOAD_RUNNING
    with _SESSION_RELOAD_LOCK:
        if _SESSION_RELOAD_RUNNING:
            return get_reload_state(store) or build_session_reload_state(
                status="collecting",
                profile=profile,
                run_label=run_label,
            )
        _SESSION_RELOAD_RUNNING = True
        state = build_session_reload_state(
            status="collecting",
            profile=profile,
            run_label=run_label,
        )
    set_reload_state(store, state)
    return state


def build_session_reload_state(
    *,
    status: str,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    run_label: str = DEFAULT_RUN_LABEL,
    stage: str = "starting",
    detail: str | None = None,
    progress_current: int = 0,
    progress_total: int = 0,
    current_source: str | None = None,
    session_id: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "profile": profile,
        "run_label": run_label,
        "stage": stage,
        "detail": detail
        or (
            "reload 요청을 받아 실제 데이터를 다시 수집하기 시작합니다."
            if status != "error"
            else "reload 처리 중 오류가 발생했습니다."
        ),
        "progress_current": progress_current,
        "progress_total": progress_total,
        "current_source": current_source,
        "session_id": session_id,
        "started_at": now_utc_iso(),
        "updated_at": now_utc_iso(),
        "error": compact_text(error, 180) or None,
    }


def update_session_reload_state(
    store: RedisLike,
    *,
    status: str,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    run_label: str = DEFAULT_RUN_LABEL,
    stage: str,
    detail: str,
    progress_current: int,
    progress_total: int,
    current_source: str | None = None,
    session_id: str | None = None,
    error: str | None = None,
) -> None:
    existing = get_reload_state(store) or {}
    payload = build_session_reload_state(
        status=status,
        profile=profile,
        run_label=run_label,
        stage=stage,
        detail=detail,
        progress_current=progress_current,
        progress_total=progress_total,
        current_source=current_source,
        session_id=session_id or existing.get("session_id"),
        error=error,
    )
    payload["started_at"] = existing.get("started_at") or payload["started_at"]
    set_reload_state(store, payload)


def build_session_reload_response(state: dict[str, Any] | None) -> dict[str, Any]:
    if not state:
        return {
            "status": "idle",
            "session_id": None,
            "loading": None,
            "error": None,
        }

    status = str(state.get("status") or "collecting")
    stage = str(state.get("stage") or "starting")
    detail = str(
        state.get("detail")
        or (
            "새 session을 준비 중입니다."
            if status != "error"
            else "reload 처리 중 오류가 발생했습니다."
        )
    )
    loading = build_loading_block(
        status=status,
        stage=stage if status != "error" else "error",
        detail=str(state.get("error") or detail),
        progress_current=int(state.get("progress_current") or 0),
        progress_total=int(state.get("progress_total") or 0),
        current_source=(
            str(state.get("current_source"))
            if state.get("current_source")
            else None
        ),
    )
    return {
        "status": status,
        "session_id": state.get("session_id"),
        "loading": loading,
        "error": state.get("error"),
    }


def get_session_reload_response(store: RedisLike) -> dict[str, Any]:
    return build_session_reload_response(get_reload_state(store))


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
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    def emit_progress(**payload: Any) -> None:
        if progress_callback is None:
            return
        progress_callback(payload)

    artifacts = load_run_artifacts(run_dir)
    session_id = str(artifacts.run_manifest["run_id"])
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
        "loading_stage": "publishing_documents",
        "loading_detail": "displayable document를 Redis doc 키로 publish하고 있습니다.",
        "loading_progress_current": 0,
        "loading_progress_total": max(len(documents), 1),
        "loading_current_source": None,
    }

    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    set_json_with_ttl(
        store, session_key(session_id, "run_manifest"), artifacts.run_manifest
    )
    set_json_with_ttl(
        store, session_key(session_id, "source_manifest"), artifacts.source_manifest
    )
    emit_progress(
        status="collecting",
        stage="publishing_documents",
        detail=str(meta["loading_detail"]),
        progress_current=0,
        progress_total=max(len(documents), 1),
        current_source=None,
        session_id=session_id,
    )

    docs_total = max(len(documents), 1)
    for index, document in enumerate(documents, start=1):
        set_json_with_ttl(store, doc_key(session_id, document["document_id"]), document)
        if index == len(documents) or index == 1 or index % 10 == 0:
            meta["loading_stage"] = "publishing_documents"
            meta["loading_detail"] = (
                f"Redis doc publish 진행 중 ({index}/{len(documents)})."
                if documents
                else "publish 대상 문서가 없습니다."
            )
            meta["loading_progress_current"] = index if documents else 1
            meta["loading_progress_total"] = docs_total
            meta["loading_current_source"] = str(document.get("source") or "") or None
            meta["updated_at"] = now_utc_iso()
            set_json_with_ttl(store, session_key(session_id, "meta"), meta)
            emit_progress(
                status="collecting",
                stage="publishing_documents",
                detail=str(meta["loading_detail"]),
                progress_current=int(meta["loading_progress_current"]),
                progress_total=int(meta["loading_progress_total"]),
                current_source=meta["loading_current_source"],
                session_id=session_id,
            )

    feed_lists = {
        source: [document["document_id"] for document in documents_for_source]
        for source, documents_for_source in documents_by_source.items()
    }
    feed_total = 2
    meta["loading_stage"] = "publishing_views"
    meta["loading_detail"] = "source feed 리스트를 Redis에 기록하고 있습니다."
    meta["loading_progress_current"] = 0
    meta["loading_progress_total"] = feed_total
    meta["loading_current_source"] = None
    meta["updated_at"] = now_utc_iso()
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    emit_progress(
        status="collecting",
        stage="publishing_views",
        detail=str(meta["loading_detail"]),
        progress_current=0,
        progress_total=feed_total,
        current_source=None,
        session_id=session_id,
    )

    for source, document_ids in feed_lists.items():
        set_list_with_ttl(store, feed_key(session_id, source), document_ids)
    meta["loading_stage"] = "publishing_views"
    meta["loading_detail"] = "feed 리스트 publish를 마치고 dashboard view를 구성하고 있습니다."
    meta["loading_progress_current"] = 1
    meta["loading_progress_total"] = feed_total
    meta["loading_current_source"] = None
    meta["updated_at"] = now_utc_iso()
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    emit_progress(
        status="collecting",
        stage="publishing_views",
        detail=str(meta["loading_detail"]),
        progress_current=1,
        progress_total=feed_total,
        current_source=None,
        session_id=session_id,
    )

    meta["loading_stage"] = "published"
    meta["loading_detail"] = "Redis feed/doc/dashboard keys를 채웠고 요약 단계가 이어질 준비가 됐습니다."
    meta["loading_progress_current"] = feed_total
    meta["loading_progress_total"] = feed_total
    meta["loading_current_source"] = None
    meta["updated_at"] = now_utc_iso()
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
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
    emit_progress(
        status="published",
        stage="published",
        detail=str(meta["loading_detail"]),
        progress_current=feed_total,
        progress_total=feed_total,
        current_source=None,
        session_id=session_id,
    )

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


def run_session_enrichment(
    store: RedisLike,
    session_id: str,
    *,
    generator: SummaryGenerator | None = None,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    def emit_progress(**payload: Any) -> None:
        if progress_callback is None:
            return
        progress_callback(payload)

    generator = generator or build_summary_generator()
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

    meta["status"] = "summarizing"
    meta["summary_provider"] = provider_name
    meta["updated_at"] = now_utc_iso()
    meta["loading_stage"] = "summarizing_documents"
    meta["loading_detail"] = (
        f"선택된 문서 {pending_total}건에 대해 요약을 생성하고 있습니다."
        if pending_total
        else "요약 대상 문서가 없어 digest 단계로 바로 넘어갑니다."
    )
    meta["loading_progress_current"] = 0
    meta["loading_progress_total"] = pending_total
    meta["loading_current_source"] = None
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    emit_progress(
        status="summarizing",
        stage="summarizing_documents",
        detail=meta["loading_detail"],
        progress_current=meta["loading_progress_current"],
        progress_total=meta["loading_progress_total"],
        current_source=None,
        session_id=session_id,
    )

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
            meta["loading_stage"] = "summarizing_documents"
            meta["loading_detail"] = (
                f"문서 요약 진행 중 ({processed_summaries}/{pending_total})."
                if pending_total
                else "요약 대상 문서가 없습니다."
            )
            meta["loading_progress_current"] = processed_summaries
            meta["loading_progress_total"] = pending_total
            meta["loading_current_source"] = str(document.get("source") or "") or None
            meta["updated_at"] = now_utc_iso()
            set_json_with_ttl(store, session_key(session_id, "meta"), meta)
            emit_progress(
                status="summarizing",
                stage="summarizing_documents",
                detail=meta["loading_detail"],
                progress_current=meta["loading_progress_current"],
                progress_total=meta["loading_progress_total"],
                current_source=meta["loading_current_source"],
                session_id=session_id,
            )

    digests_by_category: dict[str, dict[str, Any]] = {}
    meta["loading_stage"] = "building_digests"
    meta["loading_detail"] = "category digest를 생성하고 있습니다."
    meta["loading_progress_current"] = 0
    meta["loading_progress_total"] = len(ORDERED_SOURCE_CATEGORIES)
    meta["loading_current_source"] = None
    meta["updated_at"] = now_utc_iso()
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    emit_progress(
        status="summarizing",
        stage="building_digests",
        detail=meta["loading_detail"],
        progress_current=meta["loading_progress_current"],
        progress_total=meta["loading_progress_total"],
        current_source=None,
        session_id=session_id,
    )
    for category in ORDERED_SOURCE_CATEGORIES:
        documents = sort_documents(category_documents.get(category, []))
        digest = build_digest_from_documents(category, documents)
        digests_by_category[category] = digest
        set_json_with_ttl(store, digest_key(session_id, category), digest)
        meta["loading_progress_current"] = len(digests_by_category)
        meta["loading_detail"] = (
            f"category digest 생성 중 ({len(digests_by_category)}/{len(ORDERED_SOURCE_CATEGORIES)})."
        )
        meta["updated_at"] = now_utc_iso()
        set_json_with_ttl(store, session_key(session_id, "meta"), meta)
        emit_progress(
            status="summarizing",
            stage="building_digests",
            detail=meta["loading_detail"],
            progress_current=meta["loading_progress_current"],
            progress_total=meta["loading_progress_total"],
            current_source=None,
            session_id=session_id,
        )

    meta["digests_ready"] = True
    meta["summaries_ready"] = summaries_ready
    meta["updated_at"] = now_utc_iso()
    meta["status"] = "partial_error" if summary_errors else "ready"
    meta["loading_stage"] = meta["status"]
    if summary_errors:
        meta["loading_detail"] = (
            f"문서 요약 {summaries_ready}건 완료, 일부 오류 {summary_errors}건이 남았습니다."
        )
    elif summaries_ready == 0 and pending_total > 0:
        meta["loading_detail"] = (
            "LLM provider가 아직 연결되지 않아 문서 요약은 건너뛰고 "
            f"category digest {len(ORDERED_SOURCE_CATEGORIES)}개만 생성했습니다."
        )
    else:
        meta["loading_detail"] = (
            f"문서 요약과 category digest {len(ORDERED_SOURCE_CATEGORIES)}개 생성을 마쳤습니다."
        )
    meta["loading_progress_current"] = len(ORDERED_SOURCE_CATEGORIES)
    meta["loading_progress_total"] = len(ORDERED_SOURCE_CATEGORIES)
    meta["loading_current_source"] = None
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    emit_progress(
        status=str(meta["status"]),
        stage=str(meta["loading_stage"]),
        detail=str(meta["loading_detail"]),
        progress_current=int(meta["loading_progress_current"]),
        progress_total=int(meta["loading_progress_total"]),
        current_source=None,
        session_id=session_id,
    )

    dashboard = build_dashboard_payload(
        session_id=session_id,
        meta=meta,
        run_manifest=run_manifest,
        source_manifest=source_manifest,
        documents_by_id=documents_by_id,
        feed_lists=feed_lists,
        digests_by_category=digests_by_category,
    )
    set_json_with_ttl(store, session_key(session_id, "dashboard"), dashboard)
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


def update_bootstrap_state(
    store: RedisLike,
    *,
    status: str,
    profile: str,
    run_label: str,
    stage: str,
    detail: str,
    progress_current: int = 0,
    progress_total: int = 0,
    current_source: str | None = None,
    error: str | None = None,
) -> None:
    existing = get_bootstrap_state(store) or {}
    payload = build_homepage_bootstrap_state(
        status=status,
        profile=profile,
        run_label=run_label,
        stage=stage,
        detail=detail,
        progress_current=progress_current,
        progress_total=progress_total,
        current_source=current_source,
        error=error,
    )
    payload["started_at"] = existing.get("started_at") or payload["started_at"]
    set_bootstrap_state(store, payload)


def run_homepage_bootstrap(
    store: RedisLike,
    *,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    run_label: str = HOMEPAGE_BOOTSTRAP_RUN_LABEL,
    timeout: float = 30.0,
) -> None:
    try:
        def handle_collect_progress(event: dict[str, Any]) -> None:
            update_bootstrap_state(
                store,
                status="collecting",
                profile=profile,
                run_label=run_label,
                stage=str(event.get("stage") or "fetching_sources"),
                detail=str(
                    event.get("detail")
                    or "실제 데이터를 수집하고 있습니다."
                ),
                progress_current=int(event.get("completed_sources") or 0),
                progress_total=int(event.get("total_sources") or 0),
                current_source=(
                    str(event.get("current_source"))
                    if event.get("current_source")
                    else None
                ),
            )

        def handle_publish_progress(event: dict[str, Any]) -> None:
            update_bootstrap_state(
                store,
                status=str(event.get("status") or "collecting"),
                profile=profile,
                run_label=run_label,
                stage=str(event.get("stage") or "publishing_documents"),
                detail=str(
                    event.get("detail")
                    or "Redis session publish를 진행하고 있습니다."
                ),
                progress_current=int(event.get("progress_current") or 0),
                progress_total=int(event.get("progress_total") or 0),
                current_source=(
                    str(event.get("current_source"))
                    if event.get("current_source")
                    else None
                ),
            )

        _, run_dir = collect_run(
            profile=profile,
            run_label=run_label,
            timeout=timeout,
            progress_callback=handle_collect_progress,
        )
        result = publish_run(
            store,
            run_dir,
            queue=False,
            progress_callback=handle_publish_progress,
        )
        run_session_enrichment(store, result["session_id"])
        store.delete(BOOTSTRAP_STATE_KEY)
    except Exception as exc:
        current_state = get_bootstrap_state(store) or {}
        set_bootstrap_state(
            store,
            build_homepage_bootstrap_state(
                status="error",
                profile=profile,
                run_label=run_label,
                stage=str(current_state.get("stage") or "error"),
                detail="자동 수집 중 오류가 발생했습니다.",
                progress_current=int(current_state.get("progress_current") or 0),
                progress_total=int(current_state.get("progress_total") or 0),
                current_source=(
                    str(current_state.get("current_source"))
                    if current_state.get("current_source")
                    else None
                ),
                error=str(exc),
            ),
        )
    finally:
        set_homepage_bootstrap_running(False)


def run_session_reload(
    store: RedisLike,
    *,
    sources: list[str] | None = None,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
) -> None:
    try:
        def handle_collect_progress(event: dict[str, Any]) -> None:
            update_session_reload_state(
                store,
                status="collecting",
                profile=profile,
                run_label=run_label,
                stage=str(event.get("stage") or "fetching_sources"),
                detail=str(
                    event.get("detail")
                    or "실제 데이터를 다시 수집하고 있습니다."
                ),
                progress_current=int(event.get("completed_sources") or 0),
                progress_total=int(event.get("total_sources") or 0),
                current_source=(
                    str(event.get("current_source"))
                    if event.get("current_source")
                    else None
                ),
                session_id=(
                    str(event.get("run_id"))
                    if event.get("run_id")
                    else None
                ),
            )

        def handle_enrichment_progress(event: dict[str, Any]) -> None:
            update_session_reload_state(
                store,
                status=str(event.get("status") or "summarizing"),
                profile=profile,
                run_label=run_label,
                stage=str(event.get("stage") or "summarizing_documents"),
                detail=str(
                    event.get("detail")
                    or "문서 요약과 digest를 갱신하고 있습니다."
                ),
                progress_current=int(event.get("progress_current") or 0),
                progress_total=int(event.get("progress_total") or 0),
                current_source=(
                    str(event.get("current_source"))
                    if event.get("current_source")
                    else None
                ),
                session_id=(
                    str(event.get("session_id"))
                    if event.get("session_id")
                    else None
                ),
            )

        def handle_publish_progress(event: dict[str, Any]) -> None:
            update_session_reload_state(
                store,
                status=str(event.get("status") or "collecting"),
                profile=profile,
                run_label=run_label,
                stage=str(event.get("stage") or "publishing_documents"),
                detail=str(
                    event.get("detail")
                    or "Redis session publish를 진행하고 있습니다."
                ),
                progress_current=int(event.get("progress_current") or 0),
                progress_total=int(event.get("progress_total") or 0),
                current_source=(
                    str(event.get("current_source"))
                    if event.get("current_source")
                    else None
                ),
                session_id=(
                    str(event.get("session_id"))
                    if event.get("session_id")
                    else None
                ),
            )

        run_manifest, run_dir = collect_run(
            sources=sources,
            profile=profile,
            limit=limit,
            output_dir=output_dir,
            run_label=run_label,
            timeout=timeout,
            progress_callback=handle_collect_progress,
        )
        result = publish_run(
            store,
            run_dir,
            queue=False,
            progress_callback=handle_publish_progress,
        )
        enrichment_result = run_session_enrichment(
            store,
            result["session_id"],
            progress_callback=handle_enrichment_progress,
        )
        meta = enrichment_result["meta"]
        update_session_reload_state(
            store,
            status=str(meta.get("status") or "ready"),
            profile=profile,
            run_label=run_label,
            stage=str(meta.get("loading_stage") or meta.get("status") or "ready"),
            detail=str(
                meta.get("loading_detail")
                or "reload session 처리가 완료되었습니다."
            ),
            progress_current=int(meta.get("loading_progress_current") or 0),
            progress_total=int(meta.get("loading_progress_total") or 0),
            current_source=(
                str(meta.get("loading_current_source"))
                if meta.get("loading_current_source")
                else None
            ),
            session_id=result["session_id"],
        )
    except Exception as exc:
        current_state = get_reload_state(store) or {}
        set_reload_state(
            store,
            build_session_reload_state(
                status="error",
                profile=profile,
                run_label=run_label,
                stage=str(current_state.get("stage") or "error"),
                detail="reload 처리 중 오류가 발생했습니다.",
                progress_current=int(current_state.get("progress_current") or 0),
                progress_total=int(current_state.get("progress_total") or 0),
                current_source=(
                    str(current_state.get("current_source"))
                    if current_state.get("current_source")
                    else None
                ),
                session_id=(
                    str(current_state.get("session_id"))
                    if current_state.get("session_id")
                    else None
                ),
                error=str(exc),
            ),
        )
    finally:
        set_session_reload_running(False)


def start_session_reload(
    store: RedisLike,
    *,
    schedule_reload: Callable[[], None],
    sources: list[str] | None = None,
    profile: str = DEFAULT_COLLECTION_PROFILE,
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    current_state = get_reload_state(store)
    if current_state and is_session_reload_running():
        return build_session_reload_response(current_state)

    state = begin_session_reload(
        store,
        profile=profile,
        run_label=run_label,
    )
    try:
        schedule_reload()
    except Exception:
        reset_session_reload_state(store)
        raise
    return build_session_reload_response(state)


def get_or_bootstrap_dashboard_response(
    store: RedisLike,
    *,
    schedule_bootstrap: Callable[[], None],
    profile: str = DEFAULT_COLLECTION_PROFILE,
    run_label: str = HOMEPAGE_BOOTSTRAP_RUN_LABEL,
) -> dict[str, Any]:
    try:
        return get_dashboard_response(store, session="active")
    except KeyError:
        bootstrap_state = get_bootstrap_state(store)
        if bootstrap_state and bootstrap_state.get("status") == "collecting":
            if is_homepage_bootstrap_running():
                return build_bootstrap_dashboard(bootstrap_state)
        elif bootstrap_state and bootstrap_state.get("status") == "error":
            return build_bootstrap_dashboard(bootstrap_state)

        bootstrap_state = begin_homepage_bootstrap(
            store,
            profile=profile,
            run_label=run_label,
        )
        try:
            schedule_bootstrap()
        except Exception:
            reset_homepage_bootstrap_state(store)
            raise
        return build_bootstrap_dashboard(bootstrap_state)


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
    profile: str = DEFAULT_COLLECTION_PROFILE,
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
    queue: bool = True,
) -> dict[str, Any]:
    _, run_dir = collect_run(
        sources=sources,
        profile=profile,
        limit=limit,
        output_dir=output_dir,
        run_label=run_label,
        timeout=timeout,
    )
    return publish_run(store, run_dir, queue=queue)
