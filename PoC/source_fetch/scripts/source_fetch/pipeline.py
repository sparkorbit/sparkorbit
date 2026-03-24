from __future__ import annotations

import copy
import json
import subprocess
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable

from source_fetch.adapters import (
    build_summary_input,
    default_benchmark_placeholder,
    default_llm_placeholder,
    fetch_source,
    make_client,
    now_utc_iso,
    normalize_space,
    resolve_sources,
)


PROFILE_LIMITS = {
    "smoke": 1,
    "sample": 3,
    "full": 20,
}


def utc_run_id(label: str) -> str:
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H%M%SZ")
    return f"{stamp}_{label}"


def ensure_dirs(run_dir: Path) -> dict[str, Path]:
    paths = {
        "root": run_dir,
        "raw_responses": run_dir / "raw_responses",
        "raw_items": run_dir / "raw_items",
        "normalized": run_dir / "normalized",
        "samples": run_dir / "samples",
        "logs": run_dir / "logs",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_ndjson(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def git_commit() -> str | None:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        return completed.stdout.strip() or None
    except Exception:
        return None


def effective_limit(profile: str, limit: int | None) -> int:
    if limit is not None:
        return limit
    return PROFILE_LIMITS[profile]


def deep_fill(default: Any, value: Any) -> Any:
    if isinstance(default, dict):
        merged = copy.deepcopy(default)
        if isinstance(value, dict):
            for key, item in value.items():
                if key in merged:
                    merged[key] = deep_fill(merged[key], item)
                else:
                    merged[key] = copy.deepcopy(item)
        return merged
    if value is None:
        return copy.deepcopy(default)
    return copy.deepcopy(value)


def normalize_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    normalized: list[str] = []
    for value in values:
        candidate = normalize_space(str(value))
        if candidate and candidate not in normalized:
            normalized.append(candidate)
    return normalized


def document_contract_defaults() -> dict[str, Any]:
    return {
        "document_id": None,
        "run_id": None,
        "source": None,
        "source_category": None,
        "source_method": None,
        "source_endpoint": None,
        "source_item_id": None,
        "doc_type": None,
        "content_type": None,
        "text_scope": "empty",
        "title": None,
        "description": None,
        "url": None,
        "canonical_url": None,
        "reference_url": None,
        "author": None,
        "authors": [],
        "published_at": None,
        "updated_at": None,
        "sort_at": None,
        "time_semantics": "observed",
        "timestamp_kind": "observed",
        "body_text": None,
        "summary_input_text": "",
        "language": None,
        "content_format": "plain_text",
        "external_ids": {},
        "related_urls": [],
        "tags": [],
        "engagement": {},
        "engagement_primary": {"name": None, "value": None},
        "discovery": default_discovery_placeholder(),
        "ranking": default_ranking_placeholder(),
        "benchmark": default_benchmark_placeholder(),
        "reference": {
            "source_label": None,
            "display_title": None,
            "display_url": None,
            "snippet": None,
        },
        "llm": default_llm_placeholder(),
        "metadata": {},
        "raw_ref": {
            "fetch_id": None,
            "line_index": None,
            "response_file": None,
        },
        "fetched_at": None,
    }


def metric_contract_defaults() -> dict[str, Any]:
    return {
        "run_id": None,
        "source": None,
        "source_item_id": None,
        "metric_name": None,
        "metric_key": None,
        "metric_label": None,
        "metric_unit": None,
        "metric_kind": "gauge",
        "metric_value": None,
        "observed_at": None,
        "metadata": {},
    }


def default_discovery_placeholder() -> dict[str, Any]:
    return {
        "is_new": None,
        "age_hours": None,
        "freshness_bucket": None,
        "spark_score": None,
        "spark_bucket": None,
        "primary_reason": None,
    }


def default_ranking_placeholder() -> dict[str, Any]:
    return {
        "feed_score": None,
        "feed_bucket": None,
        "age_penalty": None,
        "evergreen_bonus": None,
        "priority_reason": None,
    }


def parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def compute_discovery_profile(document: dict[str, Any]) -> dict[str, Any]:
    fetched_dt = parse_iso_datetime(document.get("fetched_at"))
    sort_dt = parse_iso_datetime(document.get("sort_at"))
    age_hours = None
    if fetched_dt and sort_dt:
        age_hours = max(0.0, round((fetched_dt - sort_dt).total_seconds() / 3600, 2))

    freshness_bucket = None
    freshness_score = 0
    if age_hours is not None:
        if age_hours <= 12:
            freshness_bucket = "just_now"
            freshness_score = 70
        elif age_hours <= 48:
            freshness_bucket = "new"
            freshness_score = 55
        elif age_hours <= 168:
            freshness_bucket = "recent"
            freshness_score = 35
        elif age_hours <= 720:
            freshness_bucket = "active"
            freshness_score = 15
        else:
            freshness_bucket = "established"
            freshness_score = 0

    source = document.get("source") or ""
    doc_type = document.get("doc_type") or ""
    tags = set(document.get("tags") or [])
    engagement = document.get("engagement") or {}
    metadata = document.get("metadata") or {}
    spark_score = freshness_score
    reasons: list[str] = []

    if source == "hf_models_new":
        spark_score += 25
        reasons.append("new_model_feed")
    if source == "hf_trending_models" or "trending" in tags:
        spark_score += 20
        reasons.append("trending_feed")
    if doc_type in {"release", "release_note"} and freshness_bucket in {"just_now", "new", "recent"}:
        spark_score += 10
        reasons.append("fresh_release")
    trending_position = metadata.get("trending_position")
    if isinstance(trending_position, int):
        if trending_position <= 3:
            spark_score += 12
        elif trending_position <= 10:
            spark_score += 7
        elif trending_position <= 20:
            spark_score += 3

    likes = engagement.get("likes") or 0
    downloads = engagement.get("downloads") or 0
    stars = engagement.get("stars") or 0
    score = engagement.get("score") or 0
    votes = engagement.get("votes") or 0
    comments = engagement.get("comments") or 0

    if likes >= 25:
        spark_score += 5
    if likes >= 100:
        spark_score += 10
    if likes >= 500:
        spark_score += 10
    if downloads >= 1_000:
        spark_score += 5
    if downloads >= 10_000:
        spark_score += 10
    if stars >= 100:
        spark_score += 8
    if score >= 50 or votes >= 1_000:
        spark_score += 8
    if comments >= 30:
        spark_score += 4

    spark_score = max(0, min(100, int(round(spark_score))))
    spark_bucket = "steady"
    if spark_score >= 80:
        spark_bucket = "sparkling"
    elif spark_score >= 60:
        spark_bucket = "rising"
    elif freshness_bucket in {"just_now", "new"}:
        spark_bucket = "new"

    primary_reason = None
    if reasons:
        primary_reason = reasons[0]
    elif freshness_bucket:
        primary_reason = freshness_bucket
    elif any(engagement.get(key) for key in ("likes", "downloads", "stars", "score", "votes")):
        primary_reason = "engagement"

    return {
        "is_new": age_hours is not None and age_hours <= 72,
        "age_hours": age_hours,
        "freshness_bucket": freshness_bucket,
        "spark_score": spark_score,
        "spark_bucket": spark_bucket,
        "primary_reason": primary_reason,
    }


def compute_ranking_profile(document: dict[str, Any]) -> dict[str, Any]:
    discovery = document.get("discovery") or {}
    spark_score = discovery.get("spark_score") or 0
    spark_bucket = discovery.get("spark_bucket")
    age_hours = discovery.get("age_hours")
    engagement_primary = document.get("engagement_primary") or {}
    primary_name = engagement_primary.get("name")
    primary_value = engagement_primary.get("value") or 0

    age_penalty = 0
    if isinstance(age_hours, (int, float)):
        if age_hours > 24:
            age_penalty = 5
        if age_hours > 72:
            age_penalty = 12
        if age_hours > 168:
            age_penalty = 20
        if age_hours > 720:
            age_penalty = 30
        if age_hours > 24 * 180:
            age_penalty = 38

    evergreen_bonus = 0
    if primary_name == "likes":
        if primary_value >= 100:
            evergreen_bonus = 4
        if primary_value >= 1_000:
            evergreen_bonus = 8
        if primary_value >= 10_000:
            evergreen_bonus = 12
    elif primary_name == "downloads":
        if primary_value >= 10_000:
            evergreen_bonus = 4
        if primary_value >= 100_000:
            evergreen_bonus = 8
        if primary_value >= 1_000_000:
            evergreen_bonus = 12
    elif primary_name == "stars":
        if primary_value >= 500:
            evergreen_bonus = 5
        if primary_value >= 5_000:
            evergreen_bonus = 10
    elif primary_name in {"score", "votes"}:
        if primary_value >= 100:
            evergreen_bonus = 4
        if primary_value >= 1_000:
            evergreen_bonus = 8
    elif primary_name in {"comments", "read_count"}:
        if primary_value >= 30:
            evergreen_bonus = 2
        if primary_value >= 100:
            evergreen_bonus = 4

    feed_score = max(0, min(100, int(round(spark_score - age_penalty + evergreen_bonus))))
    if feed_score >= 80:
        feed_bucket = "top"
    elif feed_score >= 55:
        feed_bucket = "live"
    elif feed_score >= 20:
        feed_bucket = "recent"
    else:
        feed_bucket = "archive"

    priority_reason = discovery.get("primary_reason")
    if spark_bucket == "sparkling" and isinstance(age_hours, (int, float)) and age_hours <= 24:
        priority_reason = "fresh_and_hot"
    elif spark_bucket in {"sparkling", "rising"}:
        priority_reason = "hot_now"
    elif feed_bucket == "archive" and evergreen_bonus >= 8:
        priority_reason = "evergreen"
    elif feed_bucket == "archive":
        priority_reason = priority_reason or "older_item"

    return {
        "feed_score": feed_score,
        "feed_bucket": feed_bucket,
        "age_penalty": age_penalty,
        "evergreen_bonus": evergreen_bonus,
        "priority_reason": priority_reason,
    }


def normalize_document_contract(document: dict[str, Any]) -> dict[str, Any]:
    normalized = deep_fill(document_contract_defaults(), document)
    if not normalized.get("document_id") and normalized.get("source") and normalized.get("source_item_id"):
        normalized["document_id"] = f"{normalized['source']}:{normalized['source_item_id']}"
    if not normalized.get("content_type"):
        normalized["content_type"] = normalized.get("doc_type")
    if not normalized.get("sort_at"):
        normalized["sort_at"] = normalized.get("updated_at") or normalized.get("published_at") or normalized.get("fetched_at")
    if not normalized.get("timestamp_kind"):
        normalized["timestamp_kind"] = normalized.get("time_semantics") or "observed"
    if not normalized.get("summary_input_text"):
        normalized["summary_input_text"] = build_summary_input(
            normalized.get("title"),
            normalized.get("description"),
            normalized.get("body_text"),
        )
    normalized["authors"] = normalize_list(normalized.get("authors"))
    if not normalized["authors"] and normalized.get("author"):
        normalized["authors"] = [normalize_space(str(normalized["author"]))]
    normalized["tags"] = normalize_list(
        [
            normalized.get("source_category"),
            normalized.get("source"),
            normalized.get("doc_type"),
            normalized.get("content_type"),
            *normalize_list(normalized.get("tags")),
        ]
    )
    normalized["related_urls"] = normalize_list(normalized.get("related_urls"))
    normalized["reference"]["source_label"] = normalized["reference"].get("source_label") or normalized.get("source")
    normalized["reference"]["display_title"] = normalized["reference"].get("display_title") or normalized.get("title")
    normalized["reference"]["display_url"] = (
        normalized["reference"].get("display_url")
        or normalized.get("reference_url")
        or normalized.get("canonical_url")
        or normalized.get("url")
    )
    if not normalized["reference"].get("snippet"):
        normalized["reference"]["snippet"] = normalized.get("description") or normalize_space(normalized.get("body_text"))[:280] or None
    normalized["discovery"] = deep_fill(default_discovery_placeholder(), normalized.get("discovery"))
    normalized["discovery"].update(compute_discovery_profile(normalized))
    normalized["ranking"] = deep_fill(default_ranking_placeholder(), normalized.get("ranking"))
    normalized["ranking"].update(compute_ranking_profile(normalized))
    return normalized


def normalize_metric_contract(metric: dict[str, Any]) -> dict[str, Any]:
    normalized = deep_fill(metric_contract_defaults(), metric)
    if not normalized.get("metric_key"):
        normalized["metric_key"] = normalized.get("metric_name")
    if not normalized.get("metric_label"):
        normalized["metric_label"] = normalized.get("metric_name")
    return normalized


def has_displayable_reference(document: dict[str, Any]) -> bool:
    return bool(document.get("title")) and any(document.get(field) for field in ("reference_url", "canonical_url", "url"))


def filter_displayable_documents(
    documents: list[dict[str, Any]],
    metrics: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    kept_documents: list[dict[str, Any]] = []
    dropped_documents: list[dict[str, Any]] = []
    for document in documents:
        if has_displayable_reference(document):
            kept_documents.append(document)
        else:
            dropped_documents.append(document)
    kept_ids = {document.get("source_item_id") for document in kept_documents}
    kept_metrics = [metric for metric in metrics if metric.get("source_item_id") in kept_ids]
    return kept_documents, kept_metrics, len(dropped_documents)


def build_contract_report(
    documents: list[dict[str, Any]],
    metrics: list[dict[str, Any]],
) -> dict[str, Any]:
    tracked_document_fields = [
        "document_id",
        "title",
        "url",
        "canonical_url",
        "reference_url",
        "published_at",
        "updated_at",
        "sort_at",
        "time_semantics",
        "description",
        "body_text",
        "summary_input_text",
        "text_scope",
        "authors",
        "discovery",
        "ranking",
        "external_ids",
        "related_urls",
        "benchmark",
        "reference",
        "llm",
    ]
    tracked_metric_fields = [
        "metric_name",
        "metric_key",
        "metric_label",
        "metric_unit",
        "metric_kind",
        "metric_value",
        "observed_at",
    ]
    document_field_report = {}
    for field in tracked_document_fields:
        document_field_report[field] = {
            "missing": sum(1 for document in documents if field not in document),
            "empty": sum(1 for document in documents if field in document and document[field] in (None, "", [], {})),
        }
    metric_field_report = {}
    for field in tracked_metric_fields:
        metric_field_report[field] = {
            "missing": sum(1 for metric in metrics if field not in metric),
            "empty": sum(1 for metric in metrics if field in metric and metric[field] in (None, "", [], {})),
        }
    return {
        "document_count": len(documents),
        "metric_count": len(metrics),
        "source_count": len({document.get("source") for document in documents}),
        "time_semantics": dict(Counter(document.get("time_semantics") for document in documents)),
        "text_scope": dict(Counter(document.get("text_scope") for document in documents)),
        "benchmark_kind": dict(Counter(document.get("benchmark", {}).get("kind") for document in documents if document.get("benchmark"))),
        "document_fields": document_field_report,
        "metric_fields": metric_field_report,
    }


def run_collection(
    *,
    sources: list[str],
    profile: str,
    limit: int | None,
    output_dir: str,
    run_label: str,
    timeout: float,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> tuple[dict[str, Any], Path]:
    def emit_progress(**payload: Any) -> None:
        if progress_callback is None:
            return
        progress_callback(payload)

    run_id = utc_run_id(run_label)
    run_dir = Path(output_dir) / run_id
    paths = ensure_dirs(run_dir)
    selected_sources = resolve_sources(sources)
    applied_limit = effective_limit(profile, limit)
    started_at = now_utc_iso()
    total_sources = len(selected_sources)

    run_manifest: dict[str, Any] = {
        "run_id": run_id,
        "profile": profile,
        "limit": applied_limit,
        "started_at": started_at,
        "finished_at": None,
        "git_commit": git_commit(),
        "requested_sources": [source.name for source in selected_sources],
        "success_count": 0,
        "skipped_count": 0,
        "excluded_count": 0,
        "error_count": 0,
    }
    source_manifest_entries: list[dict[str, Any]] = []
    fetch_log_rows: list[dict[str, Any]] = []
    error_rows: list[dict[str, Any]] = []

    client = make_client(timeout=timeout)
    try:
        emit_progress(
            stage="starting",
            run_id=run_id,
            total_sources=total_sources,
            completed_sources=0,
            current_source=None,
            detail=f"Preparing {total_sources} source(s) for collection.",
        )
        for source in selected_sources:
            source_started_at = datetime.now(UTC)
            emit_progress(
                stage="fetching_sources",
                run_id=run_id,
                total_sources=total_sources,
                completed_sources=len(source_manifest_entries),
                current_source=source.name,
                source_index=len(source_manifest_entries) + 1,
                detail=f"Fetching {source.name} ({len(source_manifest_entries) + 1}/{total_sources}).",
            )
            try:
                result = fetch_source(client, source, run_id, applied_limit)
                result.documents = [normalize_document_contract(document) for document in result.documents]
                result.metrics = [normalize_metric_contract(metric) for metric in result.metrics]
                filtered_documents, filtered_metrics, excluded_documents = filter_displayable_documents(result.documents, result.metrics)
                result.documents = filtered_documents
                result.metrics = filtered_metrics
                if excluded_documents:
                    result.notes.append(f"Excluded {excluded_documents} document(s) without a displayable URL/reference.")

                raw_dir = paths["raw_responses"] / source.name
                raw_dir.mkdir(parents=True, exist_ok=True)
                raw_response_paths: list[str] = []
                for raw in result.raw_responses:
                    raw_path = raw_dir / raw.filename
                    raw_path.write_bytes(raw.body)
                    raw_response_paths.append(str(raw_path.relative_to(run_dir)))

                raw_items_path = paths["raw_items"] / f"{source.name}.ndjson"
                append_ndjson(raw_items_path, result.raw_items)
                documents_path = paths["normalized"] / "documents.ndjson"
                metrics_path = paths["normalized"] / "metrics.ndjson"
                append_ndjson(documents_path, result.documents)
                append_ndjson(metrics_path, result.metrics)

                sample_path = paths["samples"] / f"{source.name}.sample.json"
                write_json(
                    sample_path,
                    {
                        "source": source.name,
                        "endpoint": source.endpoint,
                        "notes": result.notes,
                        "raw_items_preview": result.raw_items[:3],
                        "documents_preview": result.documents[:3],
                        "metrics_preview": result.metrics[:5],
                    },
                )

                duration_ms = int((datetime.now(UTC) - source_started_at).total_seconds() * 1000)
                notes_text = " ".join(result.notes).lower()
                if "rate limit" in notes_text and not result.raw_items:
                    status = "skipped"
                elif result.documents:
                    status = "ok"
                elif result.raw_items:
                    status = "excluded"
                else:
                    status = "ok"
                manifest_entry = {
                    "source": source.name,
                    "endpoint": source.endpoint,
                    "status": status,
                    "item_count": len(result.raw_items),
                    "normalized_count": len(result.documents),
                    "metric_count": len(result.metrics),
                    "excluded_document_count": excluded_documents,
                    "notes": result.notes,
                    "duration_ms": duration_ms,
                    "raw_response_paths": raw_response_paths,
                    "raw_items_path": str(raw_items_path.relative_to(run_dir)),
                    "sample_path": str(sample_path.relative_to(run_dir)),
                }
                source_manifest_entries.append(manifest_entry)
                fetch_log_rows.append(
                    {
                        "timestamp": now_utc_iso(),
                        "source": source.name,
                        "phase": "fetch",
                        "status": status,
                        "item_count": len(result.raw_items),
                        "normalized_count": len(result.documents),
                        "metric_count": len(result.metrics),
                        "duration_ms": duration_ms,
                    }
                )
                if status == "skipped":
                    run_manifest["skipped_count"] += 1
                elif status == "excluded":
                    run_manifest["excluded_count"] += 1
                else:
                    run_manifest["success_count"] += 1
                emit_progress(
                    stage="fetching_sources",
                    run_id=run_id,
                    total_sources=total_sources,
                    completed_sources=len(source_manifest_entries),
                    current_source=source.name,
                    source_index=len(source_manifest_entries),
                    detail=f"Completed {source.name} with status {status}.",
                )
            except Exception as exc:
                duration_ms = int((datetime.now(UTC) - source_started_at).total_seconds() * 1000)
                error_entry = {
                    "timestamp": now_utc_iso(),
                    "source": source.name,
                    "phase": "fetch",
                    "endpoint": source.endpoint,
                    "error_type": type(exc).__name__,
                    "message": str(exc),
                    "retryable": True,
                }
                error_rows.append(error_entry)
                source_manifest_entries.append(
                    {
                        "source": source.name,
                        "endpoint": source.endpoint,
                        "status": "error",
                        "item_count": 0,
                        "normalized_count": 0,
                        "metric_count": 0,
                        "excluded_document_count": 0,
                        "duration_ms": duration_ms,
                        "raw_response_paths": [],
                        "raw_items_path": None,
                        "sample_path": None,
                        "error_type": type(exc).__name__,
                        "message": str(exc),
                    }
                )
                fetch_log_rows.append(
                    {
                        "timestamp": now_utc_iso(),
                        "source": source.name,
                        "phase": "fetch",
                        "status": "error",
                        "duration_ms": duration_ms,
                    }
                )
                run_manifest["error_count"] += 1
                emit_progress(
                    stage="fetching_sources",
                    run_id=run_id,
                    total_sources=total_sources,
                    completed_sources=len(source_manifest_entries),
                    current_source=source.name,
                    source_index=len(source_manifest_entries),
                    detail=f"{source.name} failed with {type(exc).__name__}.",
                )
    finally:
        client.close()

    emit_progress(
        stage="writing_artifacts",
        run_id=run_id,
        total_sources=total_sources,
        completed_sources=len(source_manifest_entries),
        current_source=None,
        detail="Writing manifests, normalized outputs, and contract report.",
    )
    append_ndjson(paths["root"] / "source_manifest.ndjson", source_manifest_entries)
    append_ndjson(paths["logs"] / "fetch.ndjson", fetch_log_rows)
    append_ndjson(paths["logs"] / "errors.ndjson", error_rows)
    run_manifest["finished_at"] = now_utc_iso()
    write_json(paths["root"] / "run_manifest.json", run_manifest)

    documents_path = paths["normalized"] / "documents.ndjson"
    metrics_path = paths["normalized"] / "metrics.ndjson"
    documents = [
        json.loads(line)
        for line in documents_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ] if documents_path.exists() else []
    metrics = [
        json.loads(line)
        for line in metrics_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ] if metrics_path.exists() else []
    write_json(paths["normalized"] / "contract_report.json", build_contract_report(documents, metrics))
    return run_manifest, run_dir
