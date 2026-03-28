from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from ..core.constants import (
    ACTIVE_SESSION_KEY,
    BOOTSTRAP_STATE_KEY,
    BOOTSTRAP_STATE_TTL_SECONDS,
    BRIEFING_PROVIDER_ENV_VAR,
    DEFAULT_BRIEFING_PROVIDER,
    DEFAULT_RUN_LABEL,
    HOMEPAGE_BOOTSTRAP_RUN_LABEL,
    LLM_PAPER_CHUNK_SIZE,
    OLLAMA_BASE_URL,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_MODEL,
    ORDERED_SOURCE_CATEGORIES,
    QUEUE_SESSION_ENRICH_KEY,
    ROOT_DIR,
    RECENT_SESSIONS_KEY,
    RELOAD_STATE_KEY,
    RELOAD_STATE_TTL_SECONDS,
    SCHEMA_VERSION,
    SESSION_RETAIN_COUNT,
    SESSION_PREFIX,
    SESSION_TTL_SECONDS,
    SOURCE_CATEGORY_LABELS,
    SUMMARY_EXCLUDED_TEXT_SCOPES,
)
from ..core.store import RedisLike
from .collector import collect_run
from .job_progress import build_poll_path, get_or_create_job_tracker
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
OPEN_LLM_LEADERBOARD_REFERENCE_URL = "https://huggingface.co/datasets/open-llm-leaderboard/contents"
LLM_DISABLED_PROVIDER_VALUES = frozenset({"", "off", "none", "disabled", "false", "0"})

_HOMEPAGE_BOOTSTRAP_LOCK = threading.Lock()
_HOMEPAGE_BOOTSTRAP_RUNNING = False
_SESSION_RELOAD_LOCK = threading.Lock()
_SESSION_RELOAD_RUNNING = False


def now_utc_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def session_key(session_id: str, suffix: str) -> str:
    return f"{SESSION_PREFIX}:{session_id}:{suffix}"


def artifact_root_key(session_id: str) -> str:
    return session_key(session_id, "artifact_root")


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


_ARXIV_ABSTRACT_PREFIX_PATTERNS = (
    re.compile(
        r"(^|\n\n)\s*(?:arXiv:\s*[0-9]{4}\.[0-9]{4,5}(?:v\d+)?\s+)?Announce Type:\s*[^\n]*?\s+Abstract:\s*",
        re.I,
    ),
    re.compile(r"(^|\n\n)\s*Abstract:\s*", re.I),
)


def strip_arxiv_monitor_abstract(value: Any) -> Any:
    if not isinstance(value, str) or not value.strip():
        return value
    cleaned = value
    for pattern in _ARXIV_ABSTRACT_PREFIX_PATTERNS:
        cleaned = pattern.sub(r"\1", cleaned, count=1)
    cleaned = cleaned.strip()
    return cleaned or value


_HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>", re.DOTALL)
_JUNK_CONTENT_PATTERNS = (
    re.compile(r"<!doctype\s+html", re.I),
    re.compile(r"<html[\s>]", re.I),
    re.compile(r"bad\s*gateway", re.I),
    re.compile(r"internal\s*server\s*error", re.I),
    re.compile(r"403\s*forbidden", re.I),
    re.compile(r"access\s*denied", re.I),
    re.compile(r"nginx/", re.I),
    re.compile(r"apache/", re.I),
    re.compile(r"^region:\w+$", re.I),
    re.compile(r"^a blog post by .+ on hugging face$", re.I),
    re.compile(
        r"^(?:text-generation|text-to-image|image-text-to-text|feature-extraction"
        r"|fill-mask|token-classification|sentence-similarity|text-classification"
        r"|automatic-speech-recognition|audio-classification"
        r"|visual-question-answering|image-to-text|reinforcement-learning)\b",
        re.I,
    ),
)

# ``sanitize_document_for_monitor`` still checks the legacy error-pattern name.
# Keep the alias so monitor cleanup and publish-time payload building stay aligned.
_HTML_ERROR_PATTERNS = _JUNK_CONTENT_PATTERNS


def _is_tag_soup(text: str) -> bool:
    """Detect HF-style tag lists (space-separated tokens, no prose)."""
    if re.search(r"[.!?](?:\s|$)", text):
        return False
    tokens = text.split()
    if len(tokens) < 3:
        return False
    tag_like = sum(
        1
        for t in tokens
        if re.fullmatch(r"[\w.:/-]+", t) and len(t) < 60
    )
    return tag_like / len(tokens) > 0.8


def sanitize_content_text(
    text: str | None, *, title: str | None = None
) -> str | None:
    """Strip HTML, reject error pages / metadata-only / tag-soup content."""
    if not text:
        return None
    for pattern in _JUNK_CONTENT_PATTERNS:
        if pattern.search(text):
            return None
    cleaned = _HTML_TAG_RE.sub("", text).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) < 8:
        return None
    if _is_tag_soup(cleaned):
        return None
    if title:
        norm_title = re.sub(r"\s+", " ", title).strip().lower()
        norm_cleaned = cleaned.lower()
        if norm_cleaned == norm_title or norm_cleaned.startswith(norm_title + "."):
            return None
    return cleaned


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def sanitize_document_for_monitor(document: Any) -> Any:
    if not isinstance(document, dict):
        return document

    next_document = deepcopy(document)
    next_document["authors"] = _normalize_string_list(next_document.get("authors"))
    next_document["related_urls"] = _normalize_string_list(
        next_document.get("related_urls")
    )
    next_document["external_ids"] = (
        deepcopy(next_document.get("external_ids"))
        if isinstance(next_document.get("external_ids"), dict)
        else {}
    )
    next_document["engagement"] = (
        deepcopy(next_document.get("engagement"))
        if isinstance(next_document.get("engagement"), dict)
        else {}
    )
    next_document["engagement_primary"] = {
        **(
            deepcopy(next_document.get("engagement_primary"))
            if isinstance(next_document.get("engagement_primary"), dict)
            else {}
        ),
        "name": (
            (next_document.get("engagement_primary") or {}).get("name")
            if isinstance(next_document.get("engagement_primary"), dict)
            else None
        ),
        "value": (
            (next_document.get("engagement_primary") or {}).get("value")
            if isinstance(next_document.get("engagement_primary"), dict)
            else None
        ),
    }
    next_document["discovery"] = {
        **(
            deepcopy(next_document.get("discovery"))
            if isinstance(next_document.get("discovery"), dict)
            else {}
        ),
        "spark_score": (
            (next_document.get("discovery") or {}).get("spark_score")
            if isinstance(next_document.get("discovery"), dict)
            else None
        ),
    }
    next_document["ranking"] = {
        **(
            deepcopy(next_document.get("ranking"))
            if isinstance(next_document.get("ranking"), dict)
            else {}
        ),
        "feed_score": (
            (next_document.get("ranking") or {}).get("feed_score")
            if isinstance(next_document.get("ranking"), dict)
            else None
        ),
    }
    next_document["benchmark"] = {
        **(
            deepcopy(next_document.get("benchmark"))
            if isinstance(next_document.get("benchmark"), dict)
            else {}
        ),
        "kind": (
            (next_document.get("benchmark") or {}).get("kind")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "board_id": (
            (next_document.get("benchmark") or {}).get("board_id")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "board_name": (
            (next_document.get("benchmark") or {}).get("board_name")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "snapshot_at": (
            (next_document.get("benchmark") or {}).get("snapshot_at")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "rank": (
            (next_document.get("benchmark") or {}).get("rank")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "score_label": (
            (next_document.get("benchmark") or {}).get("score_label")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "score_value": (
            (next_document.get("benchmark") or {}).get("score_value")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "score_unit": (
            (next_document.get("benchmark") or {}).get("score_unit")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "votes": (
            (next_document.get("benchmark") or {}).get("votes")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "model_name": (
            (next_document.get("benchmark") or {}).get("model_name")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "organization": (
            (next_document.get("benchmark") or {}).get("organization")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "total_models": (
            (next_document.get("benchmark") or {}).get("total_models")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
        "total_votes": (
            (next_document.get("benchmark") or {}).get("total_votes")
            if isinstance(next_document.get("benchmark"), dict)
            else None
        ),
    }
    reference = (
        deepcopy(next_document.get("reference"))
        if isinstance(next_document.get("reference"), dict)
        else {}
    )
    next_document["reference"] = {
        **reference,
        "source_label": reference.get("source_label"),
        "display_title": reference.get("display_title"),
        "display_url": reference.get("display_url"),
        "snippet": reference.get("snippet"),
    }
    llm = (
        deepcopy(next_document.get("llm"))
        if isinstance(next_document.get("llm"), dict)
        else {}
    )
    run_meta = (
        deepcopy(llm.get("run_meta")) if isinstance(llm.get("run_meta"), dict) else {}
    )
    next_document["llm"] = {
        **llm,
        "status": str(llm.get("status") or "pending"),
        "summary_1l": llm.get("summary_1l"),
        "summary_short": llm.get("summary_short"),
        "key_points": _normalize_string_list(llm.get("key_points")),
        "entities": _normalize_string_list(llm.get("entities")),
        "primary_domain": llm.get("primary_domain"),
        "subdomains": _normalize_string_list(llm.get("subdomains")),
        "importance_score": llm.get("importance_score"),
        "importance_reason": llm.get("importance_reason"),
        "evidence_chunk_ids": _normalize_string_list(llm.get("evidence_chunk_ids")),
        "run_meta": {
            **run_meta,
            "model_name": run_meta.get("model_name"),
            "prompt_version": run_meta.get("prompt_version"),
            "fewshot_pack_version": run_meta.get("fewshot_pack_version"),
            "generated_at": run_meta.get("generated_at"),
        },
    }
    next_document["metadata"] = (
        deepcopy(next_document.get("metadata"))
        if isinstance(next_document.get("metadata"), dict)
        else {}
    )
    next_document["raw_ref"] = (
        deepcopy(next_document.get("raw_ref"))
        if isinstance(next_document.get("raw_ref"), dict)
        else {}
    )

    # Strip HTML tags from text fields for all sources
    for text_field in ("description", "body_text", "summary_input_text"):
        raw = next_document.get(text_field)
        if isinstance(raw, str) and _HTML_TAG_RE.search(raw):
            stripped = _HTML_TAG_RE.sub("", raw).strip()
            # If the entire content was an error page, null it out
            is_error = any(p.search(raw) for p in _HTML_ERROR_PATTERNS)
            next_document[text_field] = None if is_error else (stripped or None)

    next_document = normalize_monitor_time_fields(next_document)
    next_document["display_time"] = resolve_document_display_time(next_document)

    source = str(document.get("source") or "")
    if not source.startswith("arxiv_rss_"):
        return next_document

    next_document["description"] = strip_arxiv_monitor_abstract(
        next_document.get("description")
    )
    next_document["body_text"] = strip_arxiv_monitor_abstract(
        next_document.get("body_text")
    )
    next_document["summary_input_text"] = strip_arxiv_monitor_abstract(
        next_document.get("summary_input_text")
    )

    next_document["llm"] = {
        **next_document["llm"],
        "summary_1l": strip_arxiv_monitor_abstract(next_document["llm"].get("summary_1l")),
        "summary_short": strip_arxiv_monitor_abstract(
            next_document["llm"].get("summary_short")
        ),
    }
    next_document["reference"] = {
        **next_document["reference"],
        "snippet": strip_arxiv_monitor_abstract(
            next_document["reference"].get("snippet")
        ),
    }

    return next_document


SOURCE_DISPLAY_NAMES = {
    "amazon_science": "Amazon Science",
    "anthropic_news": "Anthropic News",
    "apple_ml": "Apple ML",
    "arxiv_rss_cs_ai": "ARXIV - AI",
    "arxiv_rss_cs_cl": "ARXIV - Language AI",
    "arxiv_rss_cs_cr": "ARXIV - Security",
    "arxiv_rss_cs_cv": "ARXIV - Vision",
    "arxiv_rss_cs_ir": "ARXIV - Search and Retrieval",
    "arxiv_rss_cs_lg": "ARXIV - Machine Learning",
    "arxiv_rss_cs_ro": "ARXIV - Robotics",
    "arxiv_rss_stat_ml": "ARXIV - Statistics and ML",
    "deepmind_blog": "Google DeepMind News",
    "deepseek_updates": "DeepSeek Updates",
    "github_bytedance_repos": "ByteDance GitHub",
    "github_curated_repos": "GitHub Curated Repos",
    "github_mindspore_repos": "MindSpore GitHub",
    "github_paddlepaddle_repos": "PaddlePaddle GitHub",
    "github_tencent_hunyuan_repos": "Tencent Hunyuan GitHub",
    "geeknews_rss": "GeekNews",
    "google_ai_blog": "Google AI News",
    "google_research_blog": "Google Research Blog",
    "groq_newsroom": "Groq News",
    "hf_blog": "Hugging Face Blog",
    "hf_daily_papers": "Hugging Face Daily Papers",
    "hf_models_new": "Hugging Face New Models",
    "hf_trending_models": "Hugging Face Trending Models",
    "hn_topstories": "Hacker News Top Stories",
    "kakao_tech_rss": "Kakao Tech",
    "lg_ai_research_blog": "LG AI Research Blog",
    "lmarena_overview": "LMArena",
    "lobsters_ai_rss": "Lobsters AI",
    "microsoft_research": "Microsoft Research",
    "mistral_news": "Mistral AI News",
    "naver_cloud_blog_rss": "NAVER Cloud Blog",
    "nvidia_deep_learning": "NVIDIA Deep Learning",
    "open_llm_leaderboard": "Open LLM Leaderboard",
    "openai_news_rss": "OpenAI News",
    "qwen_blog_rss": "Qwen Blog",
    "reddit_localllama": "Reddit - LocalLLaMA",
    "reddit_machinelearning": "Reddit - MachineLearning",
    "salesforce_ai_research_rss": "Salesforce AI Research",
    "samsung_research_posts": "Samsung Research",
    "stability_news": "Stability AI News",
    "upstage_blog": "Upstage Blog",
}

SOURCE_CATEGORY_TITLE_LABELS = {
    "papers": "Paper",
    "models": "Model",
    "community": "Community",
    "company": "Company",
    "company_kr": "Company KR",
    "company_cn": "Company CN",
    "benchmark": "Benchmark",
}

def prettify_source_name(source: str) -> str:
    normalized_source = str(source or "").strip()
    if not normalized_source:
        return "-"

    mapped = SOURCE_DISPLAY_NAMES.get(normalized_source)
    if mapped:
        return mapped

    parts = []
    for part in normalized_source.split("_"):
        if part in {"rss", "api", "posts"}:
            continue
        if part == "ai":
            parts.append("AI")
        elif part == "hf":
            parts.append("Hugging Face")
        elif part == "hn":
            parts.append("Hacker News")
        elif part == "kr":
            parts.append("KR")
        elif part == "cn":
            parts.append("CN")
        elif part == "llm":
            parts.append("LLM")
        elif part == "arxiv":
            parts.append("ARXIV")
        elif part == "github":
            parts.append("GitHub")
        elif part == "reddit":
            parts.append("Reddit")
        elif part == "openai":
            parts.append("OpenAI")
        elif part == "naver":
            parts.append("NAVER")
        elif part == "nvidia":
            parts.append("NVIDIA")
        else:
            parts.append(part.capitalize())
    return " ".join(parts) if parts else normalized_source


def prettify_source_category_title(category: Any) -> str:
    resolved = str(category or "").strip()
    if not resolved:
        return "Source"
    return SOURCE_CATEGORY_TITLE_LABELS.get(resolved, prettify_source_name(resolved))


def build_feed_panel_title(category: Any, source: str) -> str:
    readable = prettify_source_name(str(source or "").strip())
    category_label = prettify_source_category_title(category)
    if readable == "-":
        return f"[{category_label}]"
    return f"[{category_label}] {readable}"


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


DISPLAY_TIME_LABELS = {
    "published": "Published",
    "updated": "Updated",
    "created": "Created",
    "snapshot": "Snapshot",
    "submission": "Submitted",
    "observed": "Observed",
}


def _normalize_time_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _display_time_label(semantics: Any) -> str:
    normalized = str(semantics or "").strip().lower()
    return DISPLAY_TIME_LABELS.get(normalized, DISPLAY_TIME_LABELS["observed"])


def normalize_monitor_time_fields(document: dict[str, Any]) -> dict[str, Any]:
    semantics = str(document.get("time_semantics") or "").strip().lower()
    if semantics != "updated":
        return document

    # Legacy monitor payloads sometimes copied an update timestamp into
    # published_at. Clear that field so the serving layer cannot label it
    # as Published.
    document["published_at"] = None
    if not _normalize_time_text(document.get("updated_at")):
        document["updated_at"] = (
            _normalize_time_text(document.get("sort_at"))
            or _normalize_time_text(document.get("fetched_at"))
        )
    return document


def resolve_document_display_time(document: dict[str, Any]) -> dict[str, Any]:
    benchmark = document.get("benchmark") or {}
    semantics = str(document.get("time_semantics") or "").strip().lower() or "observed"
    semantics_label = _display_time_label(semantics)

    snapshot_at = _normalize_time_text(benchmark.get("snapshot_at"))
    published_at = _normalize_time_text(document.get("published_at"))
    updated_at = _normalize_time_text(document.get("updated_at"))
    sort_at = _normalize_time_text(document.get("sort_at"))
    fetched_at = _normalize_time_text(document.get("fetched_at"))

    if semantics == "snapshot":
        candidates = [
            ("benchmark.snapshot_at", snapshot_at),
            ("sort_at", sort_at),
            ("updated_at", updated_at),
            ("published_at", published_at),
            ("fetched_at", fetched_at),
        ]
    elif semantics == "updated":
        candidates = [
            ("updated_at", updated_at),
            ("sort_at", sort_at),
            ("published_at", published_at),
            ("fetched_at", fetched_at),
        ]
    else:
        candidates = [
            ("published_at", published_at),
            ("sort_at", sort_at),
            ("updated_at", updated_at),
            ("fetched_at", fetched_at),
        ]

    for field_name, value in candidates:
        if not value:
            continue
        if field_name == "benchmark.snapshot_at":
            label = DISPLAY_TIME_LABELS["snapshot"]
        elif field_name == "updated_at":
            label = DISPLAY_TIME_LABELS["updated"]
        elif field_name == "fetched_at":
            label = DISPLAY_TIME_LABELS["observed"]
        else:
            label = semantics_label
        return {
            "label": label,
            "value": value,
            "field": field_name,
            "semantics": semantics,
        }

    return {
        "label": None,
        "value": None,
        "field": None,
        "semantics": semantics,
    }


def build_document_badge(document: dict[str, Any]) -> str:
    metadata = document.get("metadata") or {}
    doc_type = str(document.get("doc_type") or "")
    source = str(document.get("source") or "")
    category = str(document.get("source_category") or "")

    # Company feeds: use readable source name (e.g. "Anthropic News"), not author
    if category in {"company", "company_kr", "company_cn"} and doc_type not in {"repo", "release"}:
        return prettify_source_name(source)

    # Community: show domain/subreddit, not username
    if source == "hn_topstories":
        return str(metadata.get("domain") or "").strip() or "Hacker News"
    if source.startswith("reddit_"):
        domain = str(metadata.get("domain") or "").strip()
        if domain.startswith("self."):
            return f"r/{domain.split('.', 1)[1]}"
        if not domain or domain == "reddit.com":
            return prettify_source_name(source)
        return domain

    # Models: show pipeline tag
    if doc_type in {"model", "model_trending"}:
        pipeline = str(metadata.get("pipeline_tag") or "").strip()
        if pipeline:
            return pipeline
        model_id = str(
            document.get("source_item_id") or document.get("title") or ""
        ).strip()
        if "/" in model_id:
            owner = model_id.split("/", 1)[0].strip()
            if owner:
                return owner

    if doc_type == "repo" and metadata.get("full_name"):
        return str(metadata.get("full_name"))

    # Papers: keep author
    author = document.get("author") or (document.get("authors") or [None])[0]
    if author:
        return str(author)

    benchmark = document.get("benchmark") or {}
    if doc_type in {"benchmark", "benchmark_panel"} and benchmark.get("board_name"):
        return str(benchmark.get("board_name"))

    return prettify_source_name(source)


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


_GENERIC_TITLES = frozenset({
    "news", "blog", "post", "article", "home", "about", "contact",
    "updates", "update", "research", "papers", "paper", "model",
    "models", "stories", "story", "announcements", "announcement",
})


def _is_generic_title(title: str | None) -> bool:
    if not title:
        return True
    stripped = title.strip()
    if len(stripped) < 4:
        return True
    return stripped.lower() in _GENERIC_TITLES


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
    document = sanitize_document_for_monitor(document)
    doc_type = str(document.get("doc_type") or "")

    # Models: show structured info instead of repeating the title
    if doc_type in {"model", "model_trending"}:
        metadata = document.get("metadata") or {}
        engagement = document.get("engagement") or {}
        parts = []
        pipeline = str(metadata.get("pipeline_tag") or "").strip()
        if pipeline:
            parts.append(pipeline)
        num_params = metadata.get("numParameters") or metadata.get("num_parameters")
        if num_params:
            params_b = int(num_params) / 1_000_000_000
            if params_b >= 1:
                parts.append(f"{params_b:.1f}B params")
            else:
                params_m = int(num_params) / 1_000_000
                parts.append(f"{params_m:.0f}M params")
        likes = int(to_number(engagement.get("likes")))
        downloads = int(to_number(engagement.get("downloads")))
        if likes:
            parts.append(f"♥ {likes:,}")
        if downloads:
            parts.append(f"↓ {downloads:,}")
        if parts:
            return " · ".join(parts)

    llm = document.get("llm") or {}
    reference = document.get("reference") or {}
    title = str(document.get("title") or "")
    candidates = [
        llm.get("summary_short"),
        document.get("description"),
        reference.get("snippet"),
        document.get("summary_input_text"),
        document.get("body_text"),
    ]
    for candidate in candidates:
        cleaned = sanitize_content_text(candidate, title=title)
        if cleaned:
            return compact_text(cleaned, 124)
    return ""


PAPER_DOMAIN_DISPLAY_NAMES = {
    "agents": "Agents",
    "diffusion": "Diffusion",
    "efficient_inference": "Efficient Inference",
    "evaluation": "Evaluation",
    "finetuning": "Finetuning",
    "llm": "LLM",
    "nlp": "NLP",
    "others": "Other Papers",
    "rag_retrieval": "RAG / Retrieval",
    "rlhf_alignment": "RLHF / Alignment",
    "robotics_embodied": "Robotics",
    "safety": "Safety",
    "video": "Video",
    "vlm": "VLM",
}

def _format_curated_label(
    value: Any, mapping: dict[str, str], *, fallback: str | None = None
) -> str | None:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return fallback
    if normalized in mapping:
        return mapping[normalized]
    return prettify_source_name(normalized)


def _resolve_primary_author_label(document: dict[str, Any]) -> str | None:
    authors = _normalize_string_list(document.get("authors"))
    candidate = authors[0] if authors else document.get("author")
    if not candidate:
        return None

    normalized = str(candidate).strip()
    if not normalized:
        return None

    parts = [part.strip() for part in re.split(r",|;|\band\b", normalized) if part.strip()]
    if len(parts) > 1:
        return f"{parts[0]} et al."
    return normalized


def _resolve_authorish_name(value: Any) -> str | None:
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    if isinstance(value, dict):
        for key in ("name", "writer", "author"):
            candidate = str(value.get(key) or "").strip()
            if candidate:
                return candidate
    return None


def _top_display_labels(values: Iterable[str | None], *, limit: int = 2) -> list[str]:
    counter: Counter[str] = Counter()
    for value in values:
        normalized = str(value or "").strip()
        if normalized:
            counter[normalized] += 1
    return [value for value, _ in counter.most_common(limit)]


def _build_paper_feed_meta(document: dict[str, Any]) -> str:
    labels = document.get("labels") or {}
    domain = _format_curated_label(
        labels.get("paper_domain"),
        PAPER_DOMAIN_DISPLAY_NAMES,
        fallback="Paper",
    )
    author = _resolve_primary_author_label(document)
    parts = [part for part in (domain, author) if part]
    return " · ".join(parts)


def _build_community_feed_meta(document: dict[str, Any]) -> str:
    doc_type = str(document.get("doc_type") or "")
    source = str(document.get("source") or "")
    engagement = document.get("engagement") or {}
    metadata = document.get("metadata") or {}

    if doc_type == "repo":
        language = str(metadata.get("language") or "").strip()
        license_name = str(metadata.get("license") or "").strip()
        topics = metadata.get("topics") or []
        topic = None
        if isinstance(topics, list):
            for raw_topic in topics:
                candidate = str(raw_topic or "").strip()
                if candidate:
                    topic = prettify_source_name(candidate)
                    break
        parts = [part for part in (language, license_name, topic) if part]
        return " · ".join(parts) or "Repository"

    if doc_type == "release":
        tag_name = str(metadata.get("tag_name") or "").strip()
        reactions_total = int(to_number(metadata.get("reactions_total")))
        parts = [f"Release {tag_name}" if tag_name else "Release"]
        if reactions_total:
            parts.append(f"{reactions_total:,} reactions")
        return " · ".join(parts)

    comments = int(to_number(engagement.get("comments")))
    score = int(to_number(engagement.get("score") or engagement.get("ups")))

    if source == "hn_topstories":
        domain = str(metadata.get("domain") or "").strip()
        parts = []
        if domain:
            parts.append(domain)
        if comments:
            parts.append(f"{comments:,} comments")
        return " · ".join(parts) if parts else ""

    if source.startswith("reddit_"):
        parts = []
        if comments:
            parts.append(f"{comments:,} comments")
        upvote_ratio = to_optional_number(engagement.get("upvote_ratio"))
        if upvote_ratio is not None and upvote_ratio > 0:
            parts.append(f"{int(round(upvote_ratio * 100))}% upvoted")
        return " · ".join(parts) if parts else ""

    return ""


def _build_company_feed_meta(document: dict[str, Any]) -> str:
    del document
    return ""


def build_feed_meta(document: dict[str, Any]) -> str:
    category = str(document.get("source_category") or "").strip()
    doc_type = document.get("doc_type")
    engagement = document.get("engagement") or {}
    metadata = document.get("metadata") or {}

    if category == "papers":
        return _build_paper_feed_meta(document)

    if category == "community":
        return _build_community_feed_meta(document)

    if category in {"company", "company_kr", "company_cn"} and doc_type not in {"repo", "release"}:
        return _build_company_feed_meta(document)

    if doc_type == "repo":
        parts = [
            str(metadata.get("language") or "").strip(),
            str(metadata.get("license") or "").strip(),
        ]
        return " · ".join(part for part in parts if part) or "Repository"

    if doc_type == "release":
        tag_name = str(metadata.get("tag_name") or "").strip()
        reactions_total = int(to_number(metadata.get("reactions_total")))
        parts = [f"Release {tag_name}" if tag_name else "Release"]
        if reactions_total:
            parts.append(f"{reactions_total:,} reactions")
        return " · ".join(parts)

    if doc_type in {"model", "model_trending"}:
        pipeline = str(metadata.get("pipeline_tag") or "").strip()
        return pipeline or "Model"
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


def build_feed_panel_summary(
    category: str, source: str, documents: list[dict[str, Any]]
) -> str | None:
    if not documents:
        return None

    if category == "papers":
        top_domains = _top_display_labels(
            _format_curated_label(
                (doc.get("labels") or {}).get("paper_domain"),
                PAPER_DOMAIN_DISPLAY_NAMES,
            )
            for doc in documents
        )
        summary = " / ".join(top_domains)
        return (
            f"{len(documents)} papers · {summary}"
            if summary
            else f"{len(documents)} papers"
        )

    if category == "community":
        if source.startswith("github_"):
            top_stars = max(
                (
                    int(to_number((doc.get("engagement") or {}).get("stars")))
                    for doc in documents
                ),
                default=0,
            )
            repo_count = sum(1 for doc in documents if str(doc.get("doc_type") or "") == "repo")
            release_count = sum(
                1 for doc in documents if str(doc.get("doc_type") or "") == "release"
            )
            parts = [f"{len(documents)} items"]
            if repo_count or release_count:
                mix_parts = []
                if repo_count:
                    mix_parts.append(f"{repo_count} repos")
                if release_count:
                    mix_parts.append(f"{release_count} releases")
                parts.append(" / ".join(mix_parts))
            elif top_stars:
                parts.append(f"top repo {top_stars:,} stars")
            return " · ".join(parts)

        if source == "hn_topstories":
            top_comments = max(
                (
                    int(to_number((doc.get("engagement") or {}).get("comments")))
                    for doc in documents
                ),
                default=0,
            )
            return (
                f"{len(documents)} discussions · top {top_comments:,} comments"
                if top_comments
                else f"{len(documents)} discussions"
            )

        if source.startswith("reddit_"):
            top_comments = max(
                (
                    int(to_number((doc.get("engagement") or {}).get("comments")))
                    for doc in documents
                ),
                default=0,
            )
            return (
                f"{len(documents)} discussions · top {top_comments:,} comments"
                if top_comments
                else f"{len(documents)} discussions"
            )

    if category in {"company", "company_kr", "company_cn"}:
        repo_count = sum(1 for doc in documents if str(doc.get("doc_type") or "") == "repo")
        release_count = sum(
            1 for doc in documents if str(doc.get("doc_type") or "") == "release"
        )
        if repo_count or release_count:
            mix_parts = []
            if repo_count:
                mix_parts.append(f"{repo_count} repos")
            if release_count:
                mix_parts.append(f"{release_count} releases")
            return f"{len(documents)} items · {' / '.join(mix_parts)}"
        return f"{len(documents)} updates · {prettify_source_name(source)}"

    return None


def _build_engagement_label(document: dict[str, Any]) -> str:
    doc_type = document.get("doc_type")
    source = str(document.get("source") or "")
    engagement = document.get("engagement") or {}

    if doc_type in {"model", "model_trending"} or source.startswith("hf_"):
        likes = int(to_number(engagement.get("likes")))
        if source == "hf_trending_models":
            score = engagement.get("trending_score")
            if score is not None:
                return f"🔥 {int(to_number(score))}"
            if likes:
                return f"♥ {likes:,}"
        elif source == "hf_models_new":
            downloads = int(to_number(engagement.get("downloads")))
            if downloads:
                return f"↓ {downloads:,}"
            if likes:
                return f"♥ {likes:,}"
        elif likes:
            return f"♥ {likes:,}"

    if doc_type == "repo":
        stars = int(to_number(engagement.get("stars")))
        if stars:
            return f"★ {stars:,}"

    if doc_type in {"story", "post"}:
        score = int(to_number(engagement.get("score") or engagement.get("ups")))
        if score:
            return f"▲ {score:,}"

    return ""


def _engagement_sort_value(document: dict[str, Any]) -> float:
    source = str(document.get("source") or "")
    engagement = document.get("engagement") or {}

    if source == "hf_trending_models":
        return to_number(engagement.get("trending_score")) or to_number(engagement.get("likes"))
    if source == "hf_models_new":
        return to_number(engagement.get("downloads")) or to_number(engagement.get("likes"))

    doc_type = document.get("doc_type")
    if doc_type in {"model", "model_trending"}:
        return to_number(engagement.get("likes")) or to_number(engagement.get("downloads"))
    if doc_type == "repo":
        return to_number(engagement.get("stars"))
    if doc_type in {"story", "post"}:
        return to_number(engagement.get("score") or engagement.get("ups"))

    return 0.0


_ENGAGEMENT_SORTED_SOURCES = frozenset({
    "hf_trending_models", "hf_models_new",
})


def sort_documents_for_feed(
    documents: Iterable[dict[str, Any]],
    source: str,
) -> list[dict[str, Any]]:
    if source in _ENGAGEMENT_SORTED_SOURCES:
        return sorted(
            documents,
            key=lambda d: (_engagement_sort_value(d), document_timestamp(d)),
            reverse=True,
        )
    return sort_documents(documents)


def build_visible_feed_documents(
    documents: Iterable[dict[str, Any]],
    *,
    source: str,
) -> list[dict[str, Any]]:
    visible_documents = [
        document
        for document in documents
        if not _is_generic_title(document.get("title"))
    ]
    if not visible_documents:
        return []

    return sort_documents_for_feed(visible_documents, source=source)


def build_feed_item(document: dict[str, Any]) -> dict[str, Any]:
    display_document = sanitize_document_for_monitor(document)
    display_time = display_document.get("display_time") or {}
    ranking = display_document.get("ranking") or {}
    return {
        "documentId": display_document["document_id"],
        "referenceUrl": display_document.get("reference_url")
        or display_document.get("canonical_url")
        or display_document.get("url")
        or "",
        "paperDomain": ((display_document.get("labels") or {}).get("paper_domain")),
        "timestamp": display_time.get("value") or None,
        "timestampLabel": display_time.get("label") or None,
        "source": build_document_badge(display_document),
        "type": prettify_doc_type(display_document.get("doc_type")),
        "title": str(display_document.get("title") or "-"),
        "meta": build_feed_meta(display_document),
        "note": build_document_note(display_document),
        "engagementLabel": _build_engagement_label(display_document),
        "feedScore": to_number(ranking.get("feed_score")) or None,
    }


def loading_stage_label(stage: str, status: str) -> str:
    labels = {
        "starting": "Preparing",
        "fetching_sources": "Collecting Sources",
        "writing_artifacts": "Saving Results",
        "publishing_session": "Updating Dashboard",
        "publishing_documents": "Updating Documents",
        "publishing_views": "Updating Views",
        "published": "Data Ready",
        "summarizing_documents": "Writing Summaries",
        "building_digests": "Building Overview",
        "offline_labeling": "Grouping Papers",
        "generating_briefing": "Writing Briefing",
        "ready": "Ready",
        "partial_error": "Ready with Issues",
        "error": "Error",
    }
    if status == "partial_error":
        return labels["partial_error"]
    return labels.get(stage, labels.get(status, "In Progress"))


def loading_step_statuses(stage: str, status: str) -> list[dict[str, str]]:
    steps = [
        {
            "id": "prepare",
            "label": "Prepare",
            "detail": "Setting up the scan request and current run scope.",
        },
        {
            "id": "collect",
            "label": "Collect",
            "detail": "Reading new items from each source.",
        },
        {
            "id": "normalize",
            "label": "Save Results",
            "detail": "Writing manifests and normalized artifacts to disk.",
        },
        {
            "id": "publish-docs",
            "label": "Update Documents",
            "detail": "Publishing readable documents into the cache.",
        },
        {
            "id": "publish-views",
            "label": "Update Views",
            "detail": "Refreshing feeds and dashboard views.",
        },
        {
            "id": "summarize",
            "label": "Write Summaries",
            "detail": "Extracting key lines from selected documents.",
        },
        {
            "id": "digest",
            "label": "Build Overview",
            "detail": "Building category overviews and recording final state.",
        },
        {
            "id": "labels",
            "label": "Paper Topics",
            "detail": "Applying paper grouping.",
        },
        {
            "id": "briefing",
            "label": "Briefing",
            "detail": "Generating a daily briefing from the collected documents.",
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
        "offline_labeling": 7,
        "generating_briefing": 8,
        "ready": 8,
        "partial_error": 8,
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
        "offline_labeling": 6,
        "generating_briefing": 7,
        "ready": 8,
        "partial_error": 8,
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
        "summarizing_documents": (85, 92),
        "building_digests": (93, 95),
        "offline_labeling": (96, 98),
        "generating_briefing": (99, 99),
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
            "role": "Collects raw source data and saves the canonical artifacts.",
            "status": collector_status,
        },
        {
            "name": "enricher",
            "role": "Builds summaries and overview text from collected documents.",
            "status": enricher_status,
        },
        {
            "name": "redis",
            "role": "Stores documents, feeds, summaries, and live dashboard views.",
            "status": redis_status,
        },
        {
            "name": "ui",
            "role": "Displays only the server responses prepared for the UI.",
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
            "role": "Runs a full source scan on first visit.",
            "status": collector_status,
        },
        {
            "name": "enricher",
            "role": "Adds summaries after documents are published.",
            "status": enricher_status,
        },
        {
            "name": "redis",
            "role": "Replaces the active cache when the new run is ready.",
            "status": redis_status,
        },
        {
            "name": "ui",
            "role": "Shows startup progress through the live stream.",
            "status": ui_status,
        },
    ]


def build_bootstrap_digest_items(status: str) -> list[dict[str, str]]:
    collecting_summary = "Summaries will appear once the scan completes."
    error_summary = "Startup failed. Please reopen the page or run refresh again."
    summary = collecting_summary if status == "collecting" else error_summary
    evidence = "pending" if status == "collecting" else "error"
    return [
        {
            "id": category,
            "domain": SOURCE_CATEGORY_LABELS.get(category, category),
            "headline": "scan queued" if status == "collecting" else "scan failed",
            "summary": summary,
            "evidence": evidence,
        }
        for category in ORDERED_SOURCE_CATEGORIES
    ]


def build_bootstrap_dashboard(state: dict[str, Any]) -> dict[str, Any]:
    status = str(state.get("status") or "collecting")
    started_at = str(state.get("started_at") or now_utc_iso())
    error_message = compact_text(state.get("error"), 180)
    stage = str(state.get("stage") or "starting")
    detail = str(
        state.get("detail")
        or "Collecting live data and preparing the relay cache."
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
            "note": "Full scan starts on first visit.",
        },
        {
            "label": "docs",
            "value": "0",
            "note": detail,
        },
        {
            "label": "summaries",
            "value": "pending" if status == "collecting" else "error",
            "note": error_message
            or "Summary generation starts after source collection finishes.",
        },
    ]
    return {
        "brand": {
            "name": "AI World Monitor",
            "tagline": "Starting Up",
        },
        "status": status,
        "session": {
            "title": "Starting Scan",
            "sessionId": "bootstrapping",
            "sessionDate": started_at[:10] or "unknown",
            "window": "live scan",
            "reloadRule": "If no active cache exists, the collector automatically starts a new scan.",
            "metrics": metrics,
            "runtime": build_bootstrap_runtime_items(status, stage),
            "rules": [
                "Stays in collecting state until the actual scan completes.",
                "Run output is persisted to disk as-is.",
                "Once publish completes, the active cache is swapped and the UI stream switches immediately.",
            ],
            "arenaOverview": None,
            "loading": loading,
        },
        "summary": {
            "title": "Today in AI",
            "headline": error_message or detail,
            "llm": {
                "enabled": _briefing_provider_enabled(),
                "status": "processing" if _briefing_provider_enabled() else "disabled",
                "modelName": OLLAMA_MODEL if _briefing_provider_enabled() else None,
                "summaryReady": False,
                "filteringReady": False,
                "labeledPaperCount": 0,
                "totalPaperCount": 0,
                "message": (
                    "LLM summarization and paper grouping will continue after collection."
                    if _briefing_provider_enabled()
                    else "LLM summarization and paper grouping are off. The overview will use source data only."
                ),
            },
            "paperDomains": [],
            "sourceCounts": [],
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
        or f"Current relay state is {meta.get('status') or 'published'}."
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
                "label": "summaries",
                "value": digests_ready,
                "note": f"summaries {meta.get('summaries_ready', 0)} / state {meta.get('status')}",
            },
        ],
        "runtime": build_runtime_items(
            str(meta.get("status") or "published"),
            stage=loading_stage,
        ),
        "rules": [
            "Run output is the canonical reference data.",
            "Cache only holds per-source feeds and UI views.",
            "Cross-source mixing is performed only in summaries.",
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


def prettify_owner_label(value: Any) -> str | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None

    parts = re.split(r"[-_ ]+", normalized)
    formatted_parts: list[str] = []
    for part in parts:
        token = part.strip()
        if not token:
            continue
        lower = token.lower()
        if lower in {"ai", "llm", "ml", "nlp", "hf"}:
            formatted_parts.append(lower.upper())
        elif token.isupper() or token.isdigit():
            formatted_parts.append(token)
        else:
            formatted_parts.append(token.capitalize())

    return " ".join(formatted_parts) or normalized


def clean_leaderboard_score_label(value: Any, default: str) -> str:
    normalized = re.sub(r"[⬆️↑]+", "", str(value or "")).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized or default


def build_open_llm_board(
    documents_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    open_llm_documents = [
        document
        for document in documents_by_id.values()
        if document.get("source") == "open_llm_leaderboard"
    ]
    if not open_llm_documents:
        return None

    ranked_documents = sorted(
        open_llm_documents,
        key=lambda document: (
            to_number((document.get("benchmark") or {}).get("score_value")),
            str(document.get("published_at") or document.get("sort_at") or ""),
            str(document.get("title") or ""),
        ),
        reverse=True,
    )

    entries = []
    updated_at_candidates: list[str] = []
    score_label = "Average"
    for rank, document in enumerate(ranked_documents, start=1):
        benchmark = document.get("benchmark") or {}
        metadata = document.get("metadata") or {}
        model_name = str(
            benchmark.get("model_name") or document.get("title") or ""
        ).strip()
        if not model_name:
            continue

        owner = benchmark.get("organization") or metadata.get("organization")
        if not owner and "/" in model_name:
            owner = prettify_owner_label(model_name.split("/", 1)[0])

        snapshot_at = str(
            benchmark.get("snapshot_at")
            or document.get("published_at")
            or document.get("sort_at")
            or ""
        ).strip()
        if snapshot_at:
            updated_at_candidates.append(snapshot_at)

        score_label = clean_leaderboard_score_label(
            benchmark.get("score_label"), score_label
        )
        entries.append(
            {
                "rank": rank,
                "modelName": model_name,
                "organization": str(owner).strip() or None,
                "rating": benchmark.get("score_value"),
                "votes": benchmark.get("votes"),
                "url": document.get("canonical_url")
                or document.get("reference_url")
                or document.get("url"),
                "license": metadata.get("license"),
                "contextLength": metadata.get("context_length"),
                "inputPricePerMillion": None,
                "outputPricePerMillion": None,
            }
        )

    if not entries:
        return None

    top_entry = entries[0]
    return {
        "id": "open_llm_leaderboard",
        "label": "Open LLM",
        "boardName": "Open LLM",
        "documentId": str(ranked_documents[0].get("document_id") or "open_llm_leaderboard"),
        "referenceUrl": OPEN_LLM_LEADERBOARD_REFERENCE_URL,
        "updatedAt": max(updated_at_candidates) if updated_at_candidates else None,
        "description": "Top open-weight models ranked by the Open LLM benchmark average.",
        "totalVotes": None,
        "totalModels": len(entries),
        "scoreLabel": score_label,
        "scoreUnit": "leaderboard_points",
        "topModel": top_entry,
        "topEntries": entries,
    }


def build_lmarena_session_overview(
    documents_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    lmarena_documents = [
        document
        for document in documents_by_id.values()
        if document.get("source") == "lmarena_overview"
    ]
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

    open_llm_board = build_open_llm_board(documents_by_id)
    if open_llm_board is not None:
        boards.append(open_llm_board)

    if not boards:
        return None

    return {
        "title": "Model Leaderboards",
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


PAPER_DOMAIN_DISPLAY: dict[str, str] = {
    "llm": "LLM",
    "vlm": "VLM",
    "diffusion": "Diffusion",
    "agents": "Agents",
    "reasoning": "Reasoning",
    "rlhf_alignment": "RLHF / Alignment",
    "safety": "Safety",
    "rag_retrieval": "RAG / Retrieval",
    "efficient_inference": "Efficient Inference",
    "finetuning": "Fine-tuning",
    "evaluation": "Evaluation",
    "nlp": "NLP",
    "speech_audio": "Speech / Audio",
    "robotics_embodied": "Robotics",
    "video": "Video",
    "3d_spatial": "3D / Spatial",
    "graph_structured": "Graph",
    "continual_learning": "Continual Learning",
    "federated_privacy": "Federated / Privacy",
    "medical_bio": "Medical / Bio",
    "science": "Science",
    "others": "Others",
}


def _build_paper_domain_digest(
    documents: list[dict[str, Any]],
) -> tuple[str, str]:
    """Build headline and summary from paper domain distribution."""
    from collections import Counter

    domain_counts: Counter[str] = Counter()
    for doc in documents:
        domain = str((doc.get("labels") or {}).get("paper_domain") or "others").strip() or "others"
        domain_counts[domain] += 1

    if not domain_counts:
        return "Today's Research Papers", "No domain classification available yet."

    grouped_domain_counts: Counter[str] = Counter(
        {
            domain: count
            for domain, count in domain_counts.items()
            if domain != "others"
        }
    )
    ungrouped_count = domain_counts.get("others", 0)

    if not grouped_domain_counts:
        return (
            "Today's Papers: Not grouped by domain yet",
            (
                f"{len(documents)} papers loaded. "
                "Paper domains have not been separated yet, so papers are shown without topic groups."
            ),
        )

    top_domains = grouped_domain_counts.most_common(5)
    display_parts = [
        f"{PAPER_DOMAIN_DISPLAY.get(d, d)} ({c})"
        for d, c in top_domains
    ]
    headline = "Today's Papers: " + ", ".join(
        PAPER_DOMAIN_DISPLAY.get(d, d) for d, _ in top_domains[:3]
    )
    summary = (
        f"{len(documents)} papers across {len(grouped_domain_counts)} grouped domains. "
        f"Top areas: {', '.join(display_parts)}."
    )
    if ungrouped_count > 0:
        summary += " "
        summary += (
            f"{ungrouped_count} paper is still not grouped by domain."
            if ungrouped_count == 1
            else f"{ungrouped_count} papers are still not grouped by domain."
        )
    return headline, summary


def build_digest_from_documents(
    category: str, documents: list[dict[str, Any]]
) -> dict[str, Any]:
    digest = build_placeholder_digest(category, documents)
    if not documents:
        return digest

    if category == "papers":
        headline, summary = _build_paper_domain_digest(documents)
        digest["headline"] = headline
        digest["summary"] = summary
    else:
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
        f"{len(documents)} docs · {prettify_doc_type(documents[0].get('doc_type'))}"
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

    max_papers = 15
    max_models = 5
    max_community = 5
    # Papers need broader coverage, while models/community can lean more on ranking signals.
    paper_group_limits = (
        ("arxiv", 10),
        ("hf_daily", 3),
        ("other", 2),
    )
    model_source_limits = (
        ("hf_trending_models", 3),
        ("hf_models_new", 2),
    )
    community_core_limit = 3
    community_hf_priority_sources = (
        "hf_daily_papers",
        "hf_trending_models",
        "hf_models_new",
    )
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
    for source_group, per_group_limit in paper_group_limits:
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

    community: list[dict[str, str]] = []
    community_ids: set[str] = set()
    for doc in category_docs.get("community", [])[:community_core_limit]:
        _append_community_doc(community, community_ids, doc)
    for source in community_hf_priority_sources:
        for doc in source_docs.get(source, [])[:1]:
            _append_community_doc(community, community_ids, doc)
            if len(community) >= max_community:
                break
        if len(community) >= max_community:
            break
    for doc in category_docs.get("community", [])[community_core_limit:]:
        _append_community_doc(community, community_ids, doc)
        if len(community) >= max_community:
            break
    for source in community_hf_priority_sources:
        for doc in source_docs.get(source, [])[1:]:
            _append_community_doc(community, community_ids, doc)
            if len(community) >= max_community:
                break
        if len(community) >= max_community:
            break

    models: list[dict[str, Any]] = []
    model_ids: set[str] = set()
    for source, per_source_limit in model_source_limits:
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

    total_selected_ids = paper_ids | model_ids | community_ids

    session = {
        "window": "today",
        "total_items": len(total_selected_ids),
        "category_counts": {
            "papers": len(papers),
            "company": 0,
            "models": len(models),
            "community": len(community),
        },
        "dominant_paper_domains": _top_values(papers, "domain"),
        "paper_source_groups": _top_values(papers, "source_group"),
        "dominant_company_domains": [],
        "company_issue_domains": [],
        "company_filtering_enabled": False,
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


def _resolve_briefing_status(
    meta: dict[str, Any], briefing: dict[str, Any] | None
) -> str:
    """Return briefing status for the frontend.

    - ``"ready"``      – briefing generated successfully
    - ``"processing"``  – LLM enabled, generation in progress or not yet started
    - ``"error"``       – LLM enabled but generation failed
    - ``"disabled"``    – LLM provider is turned off
    """
    if not _briefing_provider_enabled():
        return "disabled"
    if briefing is not None and briefing.get("body_en") and not briefing.get("error"):
        return "ready"
    if briefing is not None and briefing.get("error"):
        return "error"
    loading_stage = str(meta.get("loading_stage") or "")
    if loading_stage in {
        "generating_briefing",
        "collecting",
        "summarizing",
        "building_digests",
        "offline_labeling",
    }:
        return "processing"
    return "disabled"


def _briefing_provider_name() -> str:
    return (
        os.environ.get(BRIEFING_PROVIDER_ENV_VAR) or DEFAULT_BRIEFING_PROVIDER
    ).strip().lower()


def _briefing_provider_enabled() -> bool:
    return _briefing_provider_name() not in LLM_DISABLED_PROVIDER_VALUES


def _ollama_model_ready(model_name: str | None = None) -> bool:
    target = str(model_name or OLLAMA_MODEL).strip()
    if not target:
        return False

    try:
        import httpx

        response = httpx.get(f"{OLLAMA_BASE_URL.rstrip('/')}/api/tags", timeout=5.0)
        response.raise_for_status()
        payload = response.json()
        models = payload.get("models") if isinstance(payload, dict) else []
        if not isinstance(models, list):
            return False

        target_base = target.split(":", 1)[0]
        for entry in models:
            if not isinstance(entry, dict):
                continue
            for key in ("model", "name"):
                candidate = str(entry.get(key) or "").strip()
                if not candidate:
                    continue
                candidate_base = candidate.split(":", 1)[0]
                if candidate == target or candidate_base == target_base:
                    return True
    except Exception:
        return False

    return False


def _wait_for_ollama_model_ready() -> bool:
    timeout_seconds = max(
        0.0,
        float(os.getenv("SPARKORBIT_LLM_READY_TIMEOUT", "900")),
    )
    poll_interval_seconds = max(
        1.0,
        float(os.getenv("SPARKORBIT_LLM_READY_POLL_INTERVAL", "5")),
    )
    deadline = time.monotonic() + timeout_seconds

    while True:
        if _ollama_model_ready():
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(min(poll_interval_seconds, max(0.0, deadline - time.monotonic())))


def build_paper_domain_overview(
    documents: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    domain_counts: Counter[str] = Counter()
    for document in documents:
        domain = str((document.get("labels") or {}).get("paper_domain") or "others").strip() or "others"
        domain_counts[domain] += 1

    overview: list[dict[str, Any]] = []
    for domain, count in domain_counts.most_common(8):
        if domain == "others":
            label = "Not Grouped Yet"
        else:
            label = PAPER_DOMAIN_DISPLAY.get(domain, prettify_source_name(domain))
        overview.append(
            {
                "key": domain,
                "label": label,
                "count": count,
                "isUngrouped": domain == "others",
            }
        )
    return overview


def build_source_count_overview(
    panel_counts: Counter[str],
    document_counts: Counter[str],
) -> list[dict[str, Any]]:
    overview: list[dict[str, Any]] = []
    for category in ORDERED_SOURCE_CATEGORIES:
        if category == "benchmark":
            continue
        panels = int(panel_counts.get(category, 0))
        documents = int(document_counts.get(category, 0))
        if panels <= 0 and documents <= 0:
            continue
        overview.append(
            {
                "category": category,
                "label": SOURCE_CATEGORY_LABELS.get(category, category),
                "panelCount": panels,
                "documentCount": documents,
            }
        )
    return overview


def build_summary_llm_state(
    meta: dict[str, Any],
    briefing: dict[str, Any] | None,
    paper_documents: list[dict[str, Any]],
) -> dict[str, Any]:
    briefing_status = _resolve_briefing_status(meta, briefing)
    enabled = _briefing_provider_enabled()
    total_paper_count = len(paper_documents)
    labeled_paper_count = sum(
        1
        for document in paper_documents
        if "paper_domain" in (document.get("labels") or {})
    )
    filtering_ready = total_paper_count == 0 or labeled_paper_count >= total_paper_count
    summary_ready = briefing_status == "ready"
    loading_stage = str(meta.get("loading_stage") or "")
    loading_status = str(meta.get("status") or "published")
    stage_progress_current = int(meta.get("loading_progress_current") or 0)
    stage_progress_total = int(meta.get("loading_progress_total") or 0)
    stage_progress_percent = (
        int(round((stage_progress_current / stage_progress_total) * 100))
        if stage_progress_total > 0
        else None
    )

    if not enabled:
        status = "disabled"
        message = "LLM summarization and paper grouping are off. The overview is based on collected source data."
    elif briefing_status == "error":
        status = "error"
        message = "LLM summarization failed. Source data is still available while the monitor stays live."
    elif summary_ready and filtering_ready:
        status = "ready"
        message = "LLM summarization and paper grouping are ready."
    else:
        status = "processing"
        message = (
            "LLM summarization and paper grouping are still processing. "
            "The monitor is showing original source curation until they finish."
        )

    run_meta = (briefing or {}).get("run_meta") or {}
    model_name = run_meta.get("model_name") or (OLLAMA_MODEL if enabled else None)

    return {
        "enabled": enabled,
        "status": status,
        "modelName": model_name,
        "summaryReady": summary_ready,
        "filteringReady": filtering_ready,
        "labeledPaperCount": labeled_paper_count,
        "totalPaperCount": total_paper_count,
        "message": message,
        "stageLabel": (
            loading_stage_label(loading_stage, loading_status)
            if status == "processing" and loading_stage
            else None
        ),
        "stageDetail": (
            str(meta.get("loading_detail") or message)
            if status == "processing"
            else None
        ),
        "stageProgressCurrent": stage_progress_current,
        "stageProgressTotal": stage_progress_total,
        "stageProgressPercent": stage_progress_percent,
    }


_FEED_CATEGORY_ORDER = {
    "models": 0,
    "community": 1,
    "company": 2,
    "company_kr": 3,
    "company_cn": 4,
    "papers": 5,
    "benchmark": 6,
}


def build_dashboard_feed_collections(
    documents_by_id: dict[str, dict[str, Any]],
    feed_lists: dict[str, list[str]],
) -> tuple[
    list[tuple[str, list[dict[str, Any]]]],
    dict[str, list[dict[str, Any]]],
    Counter[str],
    Counter[str],
]:
    category_documents: dict[str, list[dict[str, Any]]] = {
        category: [] for category in ORDERED_SOURCE_CATEGORIES
    }
    feed_panel_counts: Counter[str] = Counter()
    feed_document_counts: Counter[str] = Counter()

    def _feed_sort_key(item: tuple[str, list[str]]) -> tuple[int, str]:
        source = item[0]
        doc_ids = item[1]
        first_doc = documents_by_id.get(doc_ids[0]) if doc_ids else None
        cat = str((first_doc or {}).get("source_category") or "community")
        return (_FEED_CATEGORY_ORDER.get(cat, 99), source)

    ordered_feeds: list[tuple[str, list[dict[str, Any]]]] = []
    for source, document_ids in sorted(feed_lists.items(), key=_feed_sort_key):
        documents = build_visible_feed_documents(
            (
                document
                for document_id in document_ids
                if (document := documents_by_id.get(document_id)) is not None
            ),
            source=source,
        )
        if not documents:
            continue
        top_document = documents[0]
        category = str(top_document.get("source_category") or "community")
        if category == "benchmark":
            continue
        category_documents.setdefault(category, []).extend(documents)
        feed_panel_counts[category] += 1
        feed_document_counts[category] += len(documents)
        ordered_feeds.append((source, documents))

    return ordered_feeds, category_documents, feed_panel_counts, feed_document_counts


def rebuild_session_category_digests(
    store: RedisLike,
    session_id: str,
    documents_by_id: dict[str, dict[str, Any]],
    feed_lists: dict[str, list[str]],
) -> dict[str, dict[str, Any]]:
    _ordered_feeds, category_documents, _panel_counts, _document_counts = (
        build_dashboard_feed_collections(documents_by_id, feed_lists)
    )
    digests_by_category: dict[str, dict[str, Any]] = {}
    for category in ORDERED_SOURCE_CATEGORIES:
        documents = sort_documents(category_documents.get(category, []))
        digest = build_digest_from_documents(category, documents)
        digests_by_category[category] = digest
        set_json_with_ttl(store, digest_key(session_id, category), digest)
    return digests_by_category


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
    ordered_feeds, category_documents, feed_panel_counts, feed_document_counts = (
        build_dashboard_feed_collections(documents_by_id, feed_lists)
    )

    for source, documents in ordered_feeds:
        top_document = documents[0]
        category = str(top_document.get("source_category") or "community")
        manifest_entry = source_manifest_lookup.get(source, {})
        panel_summary = build_feed_panel_summary(category, source, documents)
        feeds.append(
            {
                "id": source,
                "title": build_feed_panel_title(category, source),
                "eyebrow": prettify_source_category_title(category),
                "sourceNote": panel_summary
                or (manifest_entry.get("notes") or [None])[0]
                or f"{prettify_doc_type(top_document.get('doc_type'))} / {build_document_note(top_document)}",
                "items": [build_feed_item(document) for document in documents],
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
    paper_documents = sort_documents(category_documents.get("papers", []))
    summary_llm = build_summary_llm_state(meta, briefing, paper_documents)
    paper_domain_overview = (
        build_paper_domain_overview(paper_documents)
        if summary_llm.get("enabled")
        else []
    )

    return {
        "brand": {
            "name": "AI World Monitor",
            "tagline": "AI World Monitor",
        },
        "status": meta.get("status") or "published",
        "session": build_session_block(
            session_id, meta, run_manifest, source_manifest, documents_by_id
        ),
        "summary": {
            "title": "Today in AI",
            "headline": f"{hottest_digest['domain']} / {hottest_digest['headline']}",
            "briefing": briefing if briefing and not briefing.get("error") else None,
            "briefing_status": _resolve_briefing_status(meta, briefing),
            "llm": summary_llm,
            "paperDomains": paper_domain_overview,
            "sourceCounts": (
                build_source_count_overview(
                    feed_panel_counts,
                    feed_document_counts,
                )
                if not summary_llm.get("enabled")
                else []
            ),
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
            documents[document_id] = sanitize_document_for_monitor(document)
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
    if int(meta.get("schema_version") or 0) != SCHEMA_VERSION:
        return True

    dashboard_status = str(dashboard.get("status") or "")
    meta_status = str(meta.get("status") or "published")
    if dashboard_status != meta_status:
        return True

    session_block = dashboard.get("session") if isinstance(dashboard, dict) else None
    session_block = session_block if isinstance(session_block, dict) else {}
    loading_block = session_block.get("loading")
    loading_block = loading_block if isinstance(loading_block, dict) else {}
    summary_block = dashboard.get("summary") if isinstance(dashboard, dict) else None
    summary_block = summary_block if isinstance(summary_block, dict) else {}
    llm_block = summary_block.get("llm")
    llm_block = llm_block if isinstance(llm_block, dict) else {}

    expected_stage = str(meta.get("loading_stage") or meta_status)
    expected_detail = str(
        meta.get("loading_detail") or f"Current relay state is {meta_status}."
    )
    expected_current = int(meta.get("loading_progress_current") or 0)
    expected_total = int(meta.get("loading_progress_total") or 0)
    expected_llm_enabled = _briefing_provider_enabled()

    return (
        str(loading_block.get("stage") or "") != expected_stage
        or str(loading_block.get("detail") or "") != expected_detail
        or int(loading_block.get("progressCurrent") or 0) != expected_current
        or int(loading_block.get("progressTotal") or 0) != expected_total
        or bool(llm_block.get("enabled")) != expected_llm_enabled
    )


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
    digests_by_category = rebuild_session_category_digests(
        store,
        session_id,
        documents_by_id,
        feed_lists,
    )
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


def begin_homepage_bootstrap(
    store: RedisLike,
    *,
    run_label: str = HOMEPAGE_BOOTSTRAP_RUN_LABEL,
) -> tuple[dict[str, Any], bool]:
    global _HOMEPAGE_BOOTSTRAP_RUNNING
    should_start = False
    should_persist_state = False
    with _HOMEPAGE_BOOTSTRAP_LOCK:
        existing_state = get_bootstrap_state(store)
        if _HOMEPAGE_BOOTSTRAP_RUNNING:
            state = existing_state or build_homepage_bootstrap_state(
                status="collecting",
                run_label=run_label,
            )
            should_persist_state = existing_state is None
        else:
            _HOMEPAGE_BOOTSTRAP_RUNNING = True
            state = build_homepage_bootstrap_state(
                status="collecting",
                run_label=run_label,
            )
            should_start = True
            should_persist_state = True
    if should_persist_state:
        set_bootstrap_state(store, state)
    return state, should_start


def build_homepage_bootstrap_state(
    *,
    status: str,
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
        "run_label": run_label,
        "stage": stage,
        "detail": detail
        or (
            "Received homepage request; starting live data collection."
            if status != "error"
            else "An error occurred during automatic collection."
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
    run_label: str = DEFAULT_RUN_LABEL,
    job_id: str | None = None,
) -> dict[str, Any]:
    global _SESSION_RELOAD_RUNNING
    with _SESSION_RELOAD_LOCK:
        if _SESSION_RELOAD_RUNNING:
            return get_reload_state(store) or build_session_reload_state(
                status="collecting",
                run_label=run_label,
            )
        _SESSION_RELOAD_RUNNING = True
        state = build_session_reload_state(
            status="collecting",
            run_label=run_label,
            job_id=job_id,
        )
    set_reload_state(store, state)
    return state


def build_session_reload_state(
    *,
    status: str,
    run_label: str = DEFAULT_RUN_LABEL,
    stage: str = "starting",
    detail: str | None = None,
    progress_current: int = 0,
    progress_total: int = 0,
    current_source: str | None = None,
    session_id: str | None = None,
    job_id: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "run_label": run_label,
        "stage": stage,
        "detail": detail
        or (
            "Received probe request; restarting the scan."
            if status != "error"
            else "A fault occurred during the probe cycle."
        ),
        "progress_current": progress_current,
        "progress_total": progress_total,
        "current_source": current_source,
        "session_id": session_id,
        "job_id": job_id,
        "started_at": now_utc_iso(),
        "updated_at": now_utc_iso(),
        "error": compact_text(error, 180) or None,
    }


def update_session_reload_state(
    store: RedisLike,
    *,
    status: str,
    run_label: str = DEFAULT_RUN_LABEL,
    stage: str,
    detail: str,
    progress_current: int,
    progress_total: int,
    current_source: str | None = None,
    session_id: str | None = None,
    job_id: str | None = None,
    error: str | None = None,
) -> None:
    existing = get_reload_state(store) or {}
    payload = build_session_reload_state(
        status=status,
        run_label=run_label,
        stage=stage,
        detail=detail,
        progress_current=progress_current,
        progress_total=progress_total,
        current_source=current_source,
        session_id=session_id or existing.get("session_id"),
        job_id=job_id or existing.get("job_id"),
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
            "Preparing a new probe cycle."
            if status != "error"
            else "A fault occurred during the probe cycle."
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
        "job_id": state.get("job_id"),
        "poll_path": (
            build_poll_path(str(state.get("job_id")))
            if state.get("job_id")
            else None
        ),
    }


def get_session_reload_response(store: RedisLike) -> dict[str, Any]:
    return build_session_reload_response(get_reload_state(store))


def resolve_collect_progress_current(event: dict[str, Any]) -> int:
    stage = str(event.get("stage") or "")
    if stage == "fetching_sources" and event.get("source_index") is not None:
        return int(event.get("source_index") or 0)
    return int(event.get("completed_sources") or 0)


def select_summary_candidate_ids(
    documents: list[dict[str, Any]], *, limit_per_category: int = 8
) -> set[str]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for document in sort_documents(documents):
        if not has_displayable_reference(document):
            continue
        if not (document.get("summary_input_text") or "").strip():
            continue
        if document.get("text_scope") in SUMMARY_EXCLUDED_TEXT_SCOPES:
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


def reset_document_llm_state(
    document: dict[str, Any], candidate_ids: set[str]
) -> dict[str, Any]:
    normalized = deepcopy(document)
    normalized["llm"] = {
        **default_llm_state(),
        "status": (
            "pending"
            if normalized["document_id"] in candidate_ids
            else "not_selected"
        ),
    }
    return normalized


def ensure_llm_status(
    document: dict[str, Any], candidate_ids: set[str]
) -> dict[str, Any]:
    return reset_document_llm_state(document, candidate_ids)


def reset_session_llm_outputs(
    store: RedisLike,
    session_id: str,
    documents_by_id: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    candidate_ids = select_summary_candidate_ids(list(documents_by_id.values()))
    refreshed_documents: dict[str, dict[str, Any]] = {}
    for document_id, document in documents_by_id.items():
        refreshed = reset_document_llm_state(document, candidate_ids)
        refreshed_documents[document_id] = refreshed
        set_json_with_ttl(store, doc_key(session_id, document_id), refreshed)
    store.delete(session_key(session_id, "briefing"))
    return refreshed_documents


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

    paper_lookup: dict[str, str] = {
        row["document_id"]: row.get("paper_domain", "others")
        for row in artifacts.paper_domains
        if row.get("document_id")
    }
    for document in artifacts.documents:
        doc_id = document.get("document_id", "")
        labels: dict[str, Any] = {}
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
        "llm_refresh_required": True,
        "llm_refresh_requested_at": now_utc_iso(),
        "llm_refresh_completed_at": None,
        "source_ids": source_ids,
        "loading_stage": "publishing_documents",
        "loading_detail": "Pushing displayable documents into cache keys.",
        "loading_progress_current": 0,
        "loading_progress_total": max(len(documents), 1),
        "loading_current_source": None,
    }

    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    set_json_with_ttl(store, artifact_root_key(session_id), str(artifacts.run_dir))
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
                f"Cache write in progress ({index}/{len(documents)})."
                if documents
                else "No documents to write to cache."
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
    meta["loading_detail"] = "Writing feed index to cache."
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
    meta["loading_detail"] = "Feed write complete; assembling live views."
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
    meta["loading_detail"] = "Cache relay armed; ready to proceed to pattern pass."
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
    prune_stale_sessions(store, session_id)
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


LLM_ENRICH_DIR = ROOT_DIR / "pipelines" / "llm_enrich" / "scripts"
_LLM_CHUNK_START_RE = re.compile(
    r"Classifying chunk\s+(\d+)/(\d+)\s+\((\d+)\s+(?:papers|docs)\)\.\.\.",
    re.I,
)
_LLM_CHUNK_DONE_RE = re.compile(r"done in\s+([0-9.]+)s", re.I)


def _ollama_reachable() -> bool:
    """Quick check whether Ollama API is up."""
    try:
        import httpx

        resp = httpx.get(f"{OLLAMA_BASE_URL.rstrip('/')}/api/tags", timeout=3.0)
        return resp.status_code == 200
    except Exception:
        return False


def _format_eta_hint(seconds: float | None) -> str | None:
    if seconds is None or seconds <= 0:
        return None
    rounded = int(round(seconds))
    minutes, secs = divmod(rounded, 60)
    hours, minutes = divmod(minutes, 60)
    if hours > 0:
        return f"about {hours}h {minutes}m left"
    if minutes > 0:
        return f"about {minutes}m {secs}s left"
    return f"about {secs}s left"


def _run_llm_enrich_script(
    script_name: str,
    run_dir: Path,
    *,
    phase_label: str,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> bool:
    """Run an offline LLM enrichment script against a run directory.

    Returns True on success, False on any failure (non-blocking).
    """
    script_path = LLM_ENRICH_DIR / script_name
    if not script_path.exists():
        return False
    try:
        if progress_callback is not None:
            progress_callback(
                {
                    "phase": phase_label,
                    "detail": f"{phase_label} is starting.",
                    "progress_current": 0,
                    "progress_total": 0,
                    "progress_percent": None,
                    "eta_seconds": None,
                }
            )

        command = [sys.executable, str(script_path), "--run-dir", str(run_dir)]
        if script_name == "paper_enrich.py":
            command.extend(
                [
                    "--chunk-size",
                    str(LLM_PAPER_CHUNK_SIZE),
                    "--keep-alive",
                    OLLAMA_KEEP_ALIVE,
                ]
            )

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert process.stdout is not None

        active_chunk = 0
        total_chunks = 0
        completed_chunks = 0
        chunk_durations: list[float] = []
        output_lines: list[str] = []

        for raw_line in process.stdout:
            line = raw_line.strip()
            if not line:
                continue
            output_lines.append(line)

            start_match = _LLM_CHUNK_START_RE.search(line)
            if start_match:
                active_chunk = int(start_match.group(1))
                total_chunks = int(start_match.group(2))
                average_chunk_seconds = (
                    sum(chunk_durations) / len(chunk_durations)
                    if chunk_durations
                    else None
                )
                eta_seconds = (
                    average_chunk_seconds * max(total_chunks - completed_chunks, 0)
                    if average_chunk_seconds is not None
                    else None
                )
                if progress_callback is not None:
                    detail = (
                        f"{phase_label} batch {active_chunk}/{total_chunks} in progress."
                    )
                    eta_hint = _format_eta_hint(eta_seconds)
                    if eta_hint:
                        detail = f"{detail} {eta_hint}."
                    progress_callback(
                        {
                            "phase": phase_label,
                            "detail": detail,
                            "progress_current": completed_chunks,
                            "progress_total": total_chunks,
                            "progress_percent": int(
                                round((completed_chunks / total_chunks) * 100)
                            )
                            if total_chunks > 0
                            else None,
                            "eta_seconds": eta_seconds,
                        }
                    )
                continue

            done_match = _LLM_CHUNK_DONE_RE.search(line)
            if done_match and total_chunks > 0:
                chunk_durations.append(float(done_match.group(1)))
                completed_chunks = min(max(active_chunk, completed_chunks), total_chunks)
                average_chunk_seconds = sum(chunk_durations) / len(chunk_durations)
                eta_seconds = average_chunk_seconds * max(
                    total_chunks - completed_chunks,
                    0,
                )
                if progress_callback is not None:
                    detail = (
                        f"{phase_label} batch {completed_chunks}/{total_chunks} completed."
                    )
                    eta_hint = _format_eta_hint(eta_seconds)
                    if eta_hint:
                        detail = f"{detail} {eta_hint}."
                    progress_callback(
                        {
                            "phase": phase_label,
                            "detail": detail,
                            "progress_current": completed_chunks,
                            "progress_total": total_chunks,
                            "progress_percent": int(
                                round((completed_chunks / total_chunks) * 100)
                            )
                            if total_chunks > 0
                            else None,
                            "eta_seconds": eta_seconds,
                        }
                    )

        returncode = process.wait(timeout=600)
        if returncode != 0:
            logger.warning(
                "LLM enrich %s failed (exit %d): %s",
                script_name,
                returncode,
                "\n".join(output_lines)[-500:],
            )
            return False
        if progress_callback is not None and total_chunks > 0:
            progress_callback(
                {
                    "phase": phase_label,
                    "detail": f"{phase_label} completed.",
                    "progress_current": total_chunks,
                    "progress_total": total_chunks,
                    "progress_percent": 100,
                    "eta_seconds": 0,
                }
            )
        return True
    except Exception as exc:
        logger.warning("LLM enrich %s error: %s", script_name, exc)
        return False


def run_offline_llm_enrichment(
    store: RedisLike,
    session_id: str,
    run_dir: Path,
    *,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> bool:
    """Run the paper domain classifier and re-merge labels into Redis documents."""
    if not _briefing_provider_enabled():
        return False
    if not _ollama_reachable() or not _ollama_model_ready():
        return False

    logger.info("Running offline LLM enrichment for session %s", session_id)
    paper_ok = _run_llm_enrich_script(
        "paper_enrich.py",
        run_dir,
        phase_label="Paper grouping",
        progress_callback=progress_callback,
    )
    if not paper_ok:
        return False

    # Re-read labels and merge into Redis documents
    labels_dir = run_dir / "labels"
    paper_domains = read_ndjson(labels_dir / "paper_domains.ndjson")
    if not paper_domains:
        return False

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
            if doc_id in paper_lookup:
                labels["paper_domain"] = paper_lookup[doc_id]
                changed = True
            if changed:
                doc["labels"] = labels
                set_json_with_ttl(store, doc_key(session_id, doc_id), doc)
                updated += 1

    logger.info(
        "LLM enrichment merged: %d paper, %d docs updated",
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
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    def emit_progress(**payload: Any) -> None:
        if progress_callback is None:
            return
        progress_callback(payload)

    generator = generator or build_summary_generator()
    owns_briefing_generator = briefing_generator is None
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
    force_refresh = force_refresh or bool(meta.get("llm_refresh_required"))
    if force_refresh:
        meta["llm_refresh_required"] = True
        meta["llm_refresh_requested_at"] = now_utc_iso()
        meta["llm_refresh_completed_at"] = None
        documents_by_id = reset_session_llm_outputs(store, session_id, documents_by_id)
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
    meta["loading_stage"] = (
        "summarizing_documents" if summary_generation_enabled else "building_digests"
    )
    meta["loading_detail"] = (
        f"Extracting key lines from {pending_total} selected document(s)."
        if pending_total
        else "No documents for pattern extraction; skipping to sweep build."
    )
    meta["loading_progress_current"] = 0
    meta["loading_progress_total"] = pending_total if summary_generation_enabled else len(ORDERED_SOURCE_CATEGORIES)
    meta["loading_current_source"] = None
    set_json_with_ttl(store, session_key(session_id, "meta"), meta)
    emit_progress(
        status="summarizing",
        stage=str(meta["loading_stage"]),
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
            meta["loading_stage"] = "summarizing_documents"
            meta["loading_detail"] = (
                f"Pattern pass in progress ({processed_summaries}/{pending_total})."
                if pending_total
                else "No candidates for pattern pass."
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
    meta["loading_detail"] = "Building category overviews."
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
            f"Sweep build in progress ({len(digests_by_category)}/{len(ORDERED_SOURCE_CATEGORIES)})."
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

    # --- offline LLM enrichment (company filter + paper domain) ---
    llm_model_available = True
    if _briefing_provider_enabled():
        meta["loading_stage"] = "offline_labeling"
        meta["loading_detail"] = "Waiting for the local LLM model to finish loading."
        meta["loading_progress_current"] = 0
        meta["loading_progress_total"] = 1
        meta["loading_current_source"] = None
        meta["updated_at"] = now_utc_iso()
        set_json_with_ttl(store, session_key(session_id, "meta"), meta)
        emit_progress(
            status="summarizing",
            stage="offline_labeling",
            detail=meta["loading_detail"],
            progress_current=0,
            progress_total=1,
            current_source=None,
            session_id=session_id,
        )
        llm_model_available = _wait_for_ollama_model_ready()

    def handle_offline_labeling_progress(event: dict[str, Any]) -> None:
        progress_total = int(event.get("progress_total") or 0)
        progress_current = int(event.get("progress_current") or 0)
        meta["loading_stage"] = "offline_labeling"
        meta["loading_detail"] = str(
            event.get("detail")
            or meta.get("loading_detail")
            or "Applying LLM filters."
        )
        meta["loading_progress_current"] = progress_current
        meta["loading_progress_total"] = progress_total if progress_total > 0 else 1
        meta["loading_current_source"] = str(event.get("phase") or "") or None
        meta["updated_at"] = now_utc_iso()
        set_json_with_ttl(store, session_key(session_id, "meta"), meta)
        emit_progress(
            status="summarizing",
            stage="offline_labeling",
            detail=meta["loading_detail"],
            progress_current=meta["loading_progress_current"],
            progress_total=meta["loading_progress_total"],
            current_source=meta["loading_current_source"],
            session_id=session_id,
        )

    run_dir_str = get_json(store, artifact_root_key(session_id))
    if llm_model_available and run_dir_str:
        enriched = run_offline_llm_enrichment(
            store,
            session_id,
            Path(run_dir_str),
            progress_callback=handle_offline_labeling_progress,
        )
        if enriched:
            # Reload documents after label merge so briefing sees domains
            documents_by_id = get_documents_by_id(store, session_id, feed_lists)
            digests_by_category = rebuild_session_category_digests(
                store,
                session_id,
                documents_by_id,
                feed_lists,
            )

    briefing: dict[str, Any] | None = None
    if not llm_model_available and _briefing_provider_enabled():
        briefing = {
            "body_en": None,
            "category_summaries": {},
            "error": f"Local model {OLLAMA_MODEL} is not ready yet.",
            "run_meta": {
                "model_name": OLLAMA_MODEL,
                "prompt_version": None,
                "generated_at": now_utc_iso(),
            },
        }
    if briefing_generator is None and llm_model_available and _briefing_provider_enabled():
        briefing_generator = build_briefing_generator()
    if briefing_generator is not None and briefing is None:
        meta["loading_stage"] = "generating_briefing"
        meta["loading_detail"] = "Aggregating collection results to generate the daily briefing."
        meta["loading_progress_current"] = 0
        meta["loading_progress_total"] = 1
        meta["loading_current_source"] = None
        meta["updated_at"] = now_utc_iso()
        set_json_with_ttl(store, session_key(session_id, "meta"), meta)
        emit_progress(
            status="summarizing",
            stage="generating_briefing",
            detail=meta["loading_detail"],
            progress_current=0,
            progress_total=1,
            current_source=None,
            session_id=session_id,
        )
        briefing_input = build_briefing_input(documents_by_id, feed_lists)
        briefing = briefing_generator.generate_briefing(briefing_input)
        set_json_with_ttl(store, session_key(session_id, "briefing"), briefing)

        # Merge LLM-generated category summaries into digests
        cat_summaries = briefing.get("category_summaries") or {}
        for cat_key, cat_summary in cat_summaries.items():
            if cat_summary and cat_key in digests_by_category:
                digests_by_category[cat_key]["summary"] = compact_text(cat_summary, 500)
                set_json_with_ttl(
                    store, digest_key(session_id, cat_key), digests_by_category[cat_key]
                )

        meta["loading_progress_current"] = 1
        meta["loading_detail"] = (
            "Daily briefing generation complete."
            if not briefing.get("error")
            else f"Briefing generation error: {briefing.get('error', '')}"
        )
        meta["updated_at"] = now_utc_iso()
        set_json_with_ttl(store, session_key(session_id, "meta"), meta)
        emit_progress(
            status="summarizing",
            stage="generating_briefing",
            detail=meta["loading_detail"],
            progress_current=1,
            progress_total=1,
            current_source=None,
            session_id=session_id,
        )

    meta["digests_ready"] = True
    meta["summaries_ready"] = summaries_ready
    meta["llm_refresh_required"] = False
    meta["llm_refresh_completed_at"] = now_utc_iso()
    meta["updated_at"] = now_utc_iso()
    meta["status"] = "partial_error" if summary_errors else "ready"
    meta["loading_stage"] = meta["status"]
    briefing_error = briefing.get("error") if briefing else None
    if summary_errors:
        meta["loading_detail"] = (
            f"Pattern pass completed {summaries_ready} item(s), {summary_errors} fault(s) remaining."
        )
    elif briefing_error:
        meta["loading_detail"] = (
            "Document summaries and category digests are ready, "
            "but daily briefing generation failed."
        )
    elif summaries_ready == 0 and pending_total > 0:
        meta["loading_detail"] = (
            "LLM provider not connected; skipped pattern pass and "
            f"generated {len(ORDERED_SOURCE_CATEGORIES)} category overview(s) only."
        )
    else:
        meta["loading_detail"] = (
            f"Pattern pass and {len(ORDERED_SOURCE_CATEGORIES)} category overview(s) generation complete."
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


def update_bootstrap_state(
    store: RedisLike,
    *,
    status: str,
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
    run_label: str = HOMEPAGE_BOOTSTRAP_RUN_LABEL,
    timeout: float = 30.0,
    job_id: str | None = None,
) -> None:
    resolved_job_id = job_id or str(uuid.uuid4())
    tracker = get_or_create_job_tracker(
        store,
        job_id=resolved_job_id,
        surface="dashboard",
        job_type="session_loading",
    )

    try:
        def handle_collect_progress(event: dict[str, Any]) -> None:
            # collect_run emits typed events compatible with JobProgressTracker
            tracker.handle_event(event)
            # Keep legacy bootstrap state for dashboard API fallback during collection
            update_bootstrap_state(
                store,
                status="collecting",
                run_label=run_label,
                stage=str(event.get("stage") or "fetching_sources"),
                detail=str(event.get("detail") or "Scanning live data."),
                progress_current=resolve_collect_progress_current(event),
                progress_total=int(event.get("total_sources") or 0),
                current_source=(
                    str(event.get("current_source"))
                    if event.get("current_source")
                    else None
                ),
            )

        def handle_flat_progress(event: dict[str, Any]) -> None:
            # publish_run and run_session_enrichment emit flat events; convert to typed
            session_id = event.get("session_id")
            if session_id:
                tracker.handle_event({"type": "identity", "session_id": str(session_id)})
            stage = str(event.get("stage") or "").strip()
            if stage:
                tracker.handle_event({
                    "type": "stage",
                    "stage": stage,
                    "detail": event.get("detail"),
                    "progress_current": event.get("progress_current"),
                    "progress_total": event.get("progress_total"),
                    "status": event.get("status"),
                    "force": True,
                })

        def handle_publish_progress(event: dict[str, Any]) -> None:
            handle_flat_progress(event)
            update_bootstrap_state(
                store,
                status=str(event.get("status") or "collecting"),
                run_label=run_label,
                stage=str(event.get("stage") or "publishing_documents"),
                detail=str(event.get("detail") or "Cache write in progress."),
                progress_current=int(event.get("progress_current") or 0),
                progress_total=int(event.get("progress_total") or 0),
                current_source=(
                    str(event.get("current_source"))
                    if event.get("current_source")
                    else None
                ),
            )

        _, run_dir = collect_run(
            run_label=run_label,
            timeout=timeout,
            progress_callback=handle_collect_progress,
        )
        publish_run(
            store,
            run_dir,
            queue=True,
            progress_callback=handle_publish_progress,
        )
        tracker.handle_event({"type": "terminal", "status": "ready"})
        store.delete(BOOTSTRAP_STATE_KEY)
    except Exception as exc:
        tracker.handle_event({
            "type": "terminal",
            "status": "error",
            "error": {"message": str(exc)},
        })
        current_state = get_bootstrap_state(store) or {}
        set_bootstrap_state(
            store,
            build_homepage_bootstrap_state(
                status="error",
                run_label=run_label,
                stage=str(current_state.get("stage") or "error"),
                detail="An error occurred during startup.",
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
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
    job_id: str | None = None,
) -> None:
    resolved_job_id = job_id or str(uuid.uuid4())
    tracker = get_or_create_job_tracker(
        store,
        job_id=resolved_job_id,
        surface="dashboard",
        job_type="session_loading",
    )
    try:
        def handle_collect_progress(event: dict[str, Any]) -> None:
            tracker.handle_event(event)
            update_session_reload_state(
                store,
                status="collecting",
                run_label=run_label,
                stage=str(event.get("stage") or "fetching_sources"),
                detail=str(
                    event.get("detail")
                    or "Re-sweeping live data."
                ),
                progress_current=resolve_collect_progress_current(event),
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
                job_id=resolved_job_id,
            )

        def handle_flat_progress(event: dict[str, Any]) -> None:
            session_id = event.get("session_id")
            if session_id:
                tracker.handle_event({"type": "identity", "session_id": str(session_id)})
            stage = str(event.get("stage") or "").strip()
            if stage:
                tracker.handle_event({
                    "type": "stage",
                    "stage": stage,
                    "detail": event.get("detail"),
                    "progress_current": event.get("progress_current"),
                    "progress_total": event.get("progress_total"),
                    "status": event.get("status"),
                    "force": True,
                })

        def handle_publish_progress(event: dict[str, Any]) -> None:
            handle_flat_progress(event)
            update_session_reload_state(
                store,
                status=str(event.get("status") or "collecting"),
                run_label=run_label,
                stage=str(event.get("stage") or "publishing_documents"),
                detail=str(
                    event.get("detail")
                    or "Cache write in progress."
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
                job_id=resolved_job_id,
            )

        run_manifest, run_dir = collect_run(
            sources=sources,
            limit=limit,
            output_dir=output_dir,
            run_label=run_label,
            timeout=timeout,
            progress_callback=handle_collect_progress,
        )
        result = publish_run(
            store,
            run_dir,
            queue=True,
            progress_callback=handle_publish_progress,
        )
        update_session_reload_state(
            store,
            status="published",
            run_label=run_label,
            stage="published",
            detail="Original source curation is ready. LLM paper grouping and summary will continue in the background.",
            progress_current=1,
            progress_total=1,
            current_source=None,
            session_id=result["session_id"],
            job_id=resolved_job_id,
        )
        tracker.handle_event({"type": "terminal", "status": "ready"})
    except Exception as exc:
        tracker.handle_event({
            "type": "terminal",
            "status": "error",
            "error": {"message": str(exc)},
        })
        current_state = get_reload_state(store) or {}
        set_reload_state(
            store,
            build_session_reload_state(
                status="error",
                run_label=run_label,
                stage=str(current_state.get("stage") or "error"),
                detail="A fault occurred during the probe cycle.",
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
                job_id=(
                    str(current_state.get("job_id"))
                    if current_state.get("job_id")
                    else resolved_job_id
                ),
                error=str(exc),
            ),
        )
    finally:
        set_session_reload_running(False)


def start_session_reload(
    store: RedisLike,
    *,
    schedule_reload: Callable[[str], None],
    sources: list[str] | None = None,
    limit: int | None = None,
    output_dir: str | Path | None = None,
    run_label: str = DEFAULT_RUN_LABEL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    current_state = get_reload_state(store)
    if current_state and is_session_reload_running():
        return build_session_reload_response(current_state)

    resolved_job_id = str(uuid.uuid4())
    state = begin_session_reload(
        store,
        run_label=run_label,
        job_id=resolved_job_id,
    )
    try:
        schedule_reload(resolved_job_id)
    except Exception:
        reset_session_reload_state(store)
        raise
    return build_session_reload_response(state)


def get_or_bootstrap_dashboard_response(
    store: RedisLike,
    *,
    schedule_bootstrap: Callable[[], None],
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

        bootstrap_state, should_start = begin_homepage_bootstrap(
            store,
            run_label=run_label,
        )
        if should_start:
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
        sanitize_document_for_monitor(get_json(store, doc_key(session_id, document_id)))
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
    return sanitize_document_for_monitor(document)


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
