from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Protocol

import httpx

from ..core.constants import (
    BRIEFING_PROMPT_PACKS,
    BRIEFING_PROVIDER_ENV_VAR,
    DEFAULT_BRIEFING_PROVIDER,
    DEFAULT_SUMMARY_PROVIDER,
    OLLAMA_BASE_URL,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_MODEL,
    OLLAMA_NUM_CTX,
    OLLAMA_TEMPERATURE,
    OLLAMA_TIMEOUT,
    OLLAMA_TOP_K,
    OLLAMA_TOP_P,
    SUMMARY_PROVIDER_ENV_VAR,
)

logger = logging.getLogger(__name__)


def now_utc_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def compact_text(value: str | None, max_length: int = 124) -> str:
    if not value:
        return ""
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 3].rstrip() + "..."


def to_number(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


class SummaryGenerator(Protocol):
    provider_name: str
    model_name: str | None
    prompt_version: str | None
    fewshot_pack_version: str | None

    def summarize_document(self, document: dict[str, Any]) -> dict[str, Any]:
        ...


class NoopSummaryGenerator:
    provider_name = "noop"
    model_name = None
    prompt_version = None
    fewshot_pack_version = None

    def summarize_document(self, document: dict[str, Any]) -> dict[str, Any]:
        return {
            "status": "not_implemented",
            "summary_1l": None,
            "summary_short": None,
            "key_points": [],
            "entities": [],
            "primary_domain": document.get("source_category"),
            "subdomains": [],
            "importance_score": None,
            "importance_reason": None,
            "evidence_chunk_ids": [],
            "run_meta": {
                "model_name": self.model_name,
                "prompt_version": self.prompt_version,
                "fewshot_pack_version": self.fewshot_pack_version,
                "generated_at": None,
            },
        }


class HeuristicSummaryGenerator:
    provider_name = "heuristic"
    model_name = "heuristic-local"
    prompt_version = "v1"
    fewshot_pack_version = "none"

    def summarize_document(self, document: dict[str, Any]) -> dict[str, Any]:
        title = str(document.get("title") or "").strip()
        description = compact_text(
            document.get("description")
            or document.get("summary_input_text")
            or document.get("body_text"),
            220,
        )
        tags = [str(tag) for tag in (document.get("tags") or [])[:4]]
        entities = [
            segment
            for segment in re.split(r"[^A-Za-z0-9.+#-]+", title)
            if len(segment) >= 3
        ][:5]
        ranking = document.get("ranking") or {}
        discovery = document.get("discovery") or {}
        importance_reason = (
            ranking.get("priority_reason")
            or discovery.get("primary_reason")
            or document.get("doc_type")
        )
        importance_score = int(
            round(
                to_number(ranking.get("feed_score"))
                or to_number(discovery.get("spark_score"))
            )
        )
        key_points = [
            compact_text(description or title, 100),
            f"source {document.get('source')} / {document.get('doc_type')}",
        ]
        if tags:
            key_points.append(f"tags {', '.join(tags)}")

        return {
            "status": "complete",
            "summary_1l": compact_text(title, 96) or "Untitled document",
            "summary_short": description or compact_text(title, 140),
            "key_points": key_points[:3],
            "entities": entities,
            "primary_domain": document.get("source_category"),
            "subdomains": tags,
            "importance_score": importance_score,
            "importance_reason": importance_reason,
            "evidence_chunk_ids": [],
            "run_meta": {
                "model_name": self.model_name,
                "prompt_version": self.prompt_version,
                "fewshot_pack_version": self.fewshot_pack_version,
                "generated_at": now_utc_iso(),
            },
        }


def build_summary_generator(provider_name: str | None = None) -> SummaryGenerator:
    resolved = (
        provider_name
        or os.environ.get(SUMMARY_PROVIDER_ENV_VAR)
        or DEFAULT_SUMMARY_PROVIDER
    ).strip().lower()
    if resolved == "noop":
        return NoopSummaryGenerator()
    if resolved == "heuristic":
        return HeuristicSummaryGenerator()
    raise ValueError(f"Unknown summary provider: {resolved}")


CATEGORY_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
    },
    "required": ["summary"],
    "additionalProperties": False,
}


def _extract_markdown_code_block(text: str, info_string: str) -> str:
    pattern = rf"```{re.escape(info_string)}\n(.*?)\n```"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        raise ValueError(f"Code block '{info_string}' not found in prompt pack")
    return match.group(1).strip()


def _load_prompt_pack(path: Path) -> dict[str, str]:
    markdown_text = path.read_text(encoding="utf-8")
    return {
        "system_prompt": _extract_markdown_code_block(markdown_text, "prompt-system"),
        "user_prompt_template": _extract_markdown_code_block(
            markdown_text, "prompt-user-template"
        ),
    }


def _strip_markdown_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        first_newline = stripped.find("\n")
        if first_newline != -1:
            stripped = stripped[first_newline + 1 :]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
    return stripped.strip()


def _parse_llm_json(content: str, fallback_key: str = "summary_en") -> dict[str, Any]:
    try:
        return json.loads(_strip_markdown_fence(content))
    except (json.JSONDecodeError, ValueError):
        return {fallback_key: content.strip()}


def _sanitize_briefing_text(text: str) -> str:
    cleaned = _strip_markdown_fence(text)
    cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"__(.*?)__", r"\1", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"\[Session\]\s*", "", cleaned)
    cleaned = re.sub(r"^\s*summary:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _soften_briefing_text(text: str) -> str:
    softened = _sanitize_briefing_text(text)
    replacements = (
        ("Multimodal capabilities are a dominant theme", "Multimodal capabilities stand out today"),
        ("The research landscape is currently driven by", "Today's paper mix leans toward"),
        ("The research landscape is heavily concentrated on", "Today's paper mix leans toward"),
        ("A dominant theme is", "A recurring theme is"),
        ("A dominant theme involves", "One recurring theme is"),
        ("This trend is complemented by", "There is also"),
        ("Concurrently, there is a strong focus on", "There is also visible attention on"),
        ("another critical direction focuses on", "another visible theme is"),
        ("These updates collectively push the boundaries of", "Taken together, these updates touch on"),
        ("These updates collectively advance", "Taken together, these updates touch on"),
        ("The overwhelming community attention on", "Today's model attention is concentrated around"),
        ("The overwhelming community attention, marked by", "Today's model attention, marked by"),
        ("The overwhelming community attention is directed toward", "Today's model attention is concentrated around"),
        ("This trend indicates that users are prioritizing", "This points to interest in"),
        ("indicating a strong market preference for", "which points to interest in"),
        ("a major shift toward", "clear interest in"),
        ("suggests a strong interest in", "points to interest in"),
        ("suggesting the community is shifting focus from", "alongside interest in"),
        ("suggests", "points to"),
        ("indicates", "shows"),
        ("developers are focused on", "developers are discussing"),
        ("developers are discussing optimizing", "developers are discussing"),
        ("attention is shifting toward", "there is also attention on"),
        ("debating the viability of", "discussing"),
        ("creating tension between", "alongside"),
        ("while discussing", "while tracking"),
        ("is currently driven by", "leans toward"),
    )
    for before, after in replacements:
        softened = softened.replace(before, after)
    return softened.strip()


def _truncate_sentences(text: str, max_sentences: int) -> str:
    normalized = _soften_briefing_text(text)
    if not normalized:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", normalized)
    trimmed = [part.strip() for part in parts if part.strip()]
    if len(trimmed) <= max_sentences:
        return " ".join(trimmed)
    return " ".join(trimmed[:max_sentences]).strip()


def _has_company_issue(session_overview: dict[str, Any]) -> bool:
    issue_domains = session_overview.get("company_issue_domains") or []
    return bool(issue_domains)


def _build_hf_signal_sentence(session_overview: dict[str, Any]) -> str:
    hf_community_sources = {
        str(source)
        for source in (session_overview.get("hf_community_sources") or [])
        if source
    }
    hf_model_sources = {
        str(source)
        for source in (
            session_overview.get("hf_model_sources")
            or session_overview.get("active_model_sources")
            or []
        )
        if source
    }
    has_hf_daily = "hf_daily_papers" in hf_community_sources
    has_hf_hype = bool(
        hf_model_sources & {"hf_trending_models", "hf_models_new", "hf_models_likes"}
    )
    if has_hf_daily and has_hf_hype:
        return (
            "Hugging Face daily papers and model feeds are also reinforcing the same "
            "daily flow."
        )
    if has_hf_daily:
        return "Hugging Face Daily Papers is also reinforcing the current paper flow."
    if has_hf_hype:
        return "Hugging Face model feeds are also surfacing today's fresh model activity."
    return ""


def _build_today_intro(session_overview: dict[str, Any]) -> str:
    dominant_papers = session_overview.get("dominant_paper_domains") or []
    paper_phrase = ", ".join(str(value) for value in dominant_papers[:3] if value)
    if paper_phrase and _has_company_issue(session_overview):
        base = (
            f"Today’s flow leans most clearly toward {paper_phrase}, with company "
            "updates playing a secondary role in the overall picture."
        )
    elif paper_phrase:
        base = (
            f"Today’s flow leans most clearly toward {paper_phrase}, with no single "
            "company issue standing out."
        )
    elif _has_company_issue(session_overview):
        base = (
            "Today’s flow is spread across research, models, and a small set of "
            "company updates."
        )
    else:
        base = (
            "Today’s flow is shaped more by research and model attention than by a "
            "single company storyline."
        )
    hf_signal_sentence = _build_hf_signal_sentence(session_overview)
    if hf_signal_sentence:
        return f"{base} {hf_signal_sentence}"
    return base


def _int_or_zero(value: Any) -> int:
    return int(to_number(value))


def _model_display_name(item: dict[str, Any]) -> str:
    return compact_text(str(item.get("title") or ""), 72)


def _join_names(names: list[str]) -> str:
    filtered = [name for name in names if name]
    if not filtered:
        return ""
    if len(filtered) == 1:
        return filtered[0]
    if len(filtered) == 2:
        return f"{filtered[0]} and {filtered[1]}"
    return f"{', '.join(filtered[:-1])}, and {filtered[-1]}"


def _sorted_model_items(
    model_items: list[dict[str, Any]], source: str
) -> list[dict[str, Any]]:
    rows = [
        row
        for row in model_items
        if str(row.get("source") or "") == source and str(row.get("title") or "").strip()
    ]
    freshness_order = {
        "just_now": 0,
        "new": 1,
        "active": 2,
        "established": 3,
    }
    if source == "hf_trending_models":
        return sorted(
            rows,
            key=lambda row: (
                _int_or_zero(row.get("trend_rank")) or 999999,
                -_int_or_zero(row.get("feed_score")),
                -_int_or_zero(row.get("likes")),
                -_int_or_zero(row.get("downloads")),
                str(row.get("title") or ""),
            ),
        )
    if source == "hf_models_likes":
        return sorted(
            rows,
            key=lambda row: (
                -_int_or_zero(row.get("likes")),
                -_int_or_zero(row.get("downloads")),
                -_int_or_zero(row.get("feed_score")),
                str(row.get("title") or ""),
            ),
        )
    return sorted(
        rows,
        key=lambda row: (
            freshness_order.get(str(row.get("freshness") or ""), 9),
            -_int_or_zero(row.get("feed_score")),
            -_int_or_zero(row.get("downloads")),
            -_int_or_zero(row.get("likes")),
            str(row.get("title") or ""),
        ),
    )


def _has_model_traction(item: dict[str, Any]) -> bool:
    return _int_or_zero(item.get("likes")) > 0 or _int_or_zero(item.get("downloads")) > 0


def _build_models_section(
    session_overview: dict[str, Any],
    model_items: list[dict[str, Any]],
    fallback_summary: str,
) -> str:
    del session_overview
    if not model_items:
        return _truncate_sentences(fallback_summary, 1)
    trending = _sorted_model_items(model_items, "hf_trending_models")
    fresh = _sorted_model_items(model_items, "hf_models_new")
    likes = _sorted_model_items(model_items, "hf_models_likes")

    top_signal = trending[0] if trending else likes[0] if likes else fresh[0] if fresh else None
    parts: list[str] = []

    if top_signal is not None:
        parts.append(f"Top signal today: {_model_display_name(top_signal)}.")

    trending_others = [
        _model_display_name(item)
        for item in trending
        if top_signal is None or item.get("title") != top_signal.get("title")
    ][:2]
    if trending_others:
        parts.append(f"Also trending on Hugging Face: {_join_names(trending_others)}.")

    fresh_with_traction = [_model_display_name(item) for item in fresh if _has_model_traction(item)][:2]
    if fresh_with_traction:
        parts.append(
            f"Fresh uploads with early traction: {_join_names(fresh_with_traction)}."
        )
    elif fresh:
        parts.append(
            "Fresh uploads are active, with attention still spread across several new entries."
        )

    if likes:
        top_like = likes[0]
        if top_signal is None or top_like.get("title") != top_signal.get("title"):
            parts.append(f"By durable likes: {_model_display_name(top_like)}.")

    if parts:
        return " ".join(parts[:3])
    return _truncate_sentences(fallback_summary, 1)


class BriefingGenerator:
    provider_name = "ollama"
    prompt_version = "briefing_mapreduce_v8"

    CATEGORY_ORDER = ("papers", "company", "models", "community")

    def __init__(self) -> None:
        self.base_url = OLLAMA_BASE_URL.rstrip("/")
        self.model_name = OLLAMA_MODEL
        self.num_ctx = OLLAMA_NUM_CTX
        self.temperature = OLLAMA_TEMPERATURE
        self.top_p = OLLAMA_TOP_P
        self.top_k = OLLAMA_TOP_K
        self.keep_alive = OLLAMA_KEEP_ALIVE
        self.http = httpx.Client(timeout=OLLAMA_TIMEOUT)
        self._available = True

        self._category_packs: dict[str, dict[str, str]] = {}
        for cat in self.CATEGORY_ORDER:
            path = BRIEFING_PROMPT_PACKS.get(cat)
            if path is None:
                continue
            if path.exists():
                self._category_packs[cat] = _load_prompt_pack(path)

        try:
            resp = self.http.get(f"{self.base_url}/api/tags", timeout=5.0)
            resp.raise_for_status()
        except Exception:
            logger.warning(
                "Ollama not reachable at %s — briefing will be skipped",
                self.base_url,
            )
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    def unload_model(self) -> None:
        try:
            self.http.post(
                f"{self.base_url}/api/chat",
                json={"model": self.model_name, "keep_alive": 0},
                timeout=10.0,
            )
        except Exception:
            pass

    def close(self) -> None:
        self.unload_model()
        self.http.close()

    def _call_ollama(
        self, system: str, user: str, fmt: dict[str, Any]
    ) -> str:
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "format": fmt,
            "stream": False,
            "think": False,
            "keep_alive": self.keep_alive,
            "options": {
                "temperature": self.temperature,
                "top_p": self.top_p,
                "top_k": self.top_k,
                "num_ctx": self.num_ctx,
            },
        }
        resp = self.http.post(f"{self.base_url}/api/chat", json=payload)
        resp.raise_for_status()
        return (resp.json().get("message") or {}).get("content", "")

    def _summarize_category(
        self, category: str, items: list[dict[str, Any]]
    ) -> str:
        if not items:
            return ""
        pack = self._category_packs.get(category)
        if not pack:
            return ""

        user_content = pack["user_prompt_template"].format(
            items_json=json.dumps(items, ensure_ascii=False)
        )
        content = self._call_ollama(
            pack["system_prompt"], user_content, CATEGORY_SUMMARY_SCHEMA
        )
        parsed = _parse_llm_json(content, "summary")
        return _sanitize_briefing_text((parsed.get("summary") or content).strip())

    def _synthesize(
        self,
        date: str,
        session_overview: dict[str, Any],
        summaries: dict[str, str],
        model_items: list[dict[str, Any]],
    ) -> str:
        del date
        parts = [_build_today_intro(session_overview)]
        section_labels = {
            "papers": "Papers",
            "company": "Company News",
            "models": "Models",
            "community": "Community",
        }
        sentence_limits = {
            "papers": 2,
            "company": 1,
            "models": 1,
            "community": 1,
        }
        for category in self.CATEGORY_ORDER:
            if category == "company" and not _has_company_issue(session_overview):
                parts.append("[Company News] No single company issue stands out today.")
                continue
            if category == "models":
                summary = _build_models_section(
                    session_overview,
                    model_items,
                    summaries.get(category, ""),
                )
                if summary:
                    parts.append(f"[Models] {summary}")
                continue
            summary = _truncate_sentences(
                summaries.get(category, ""),
                sentence_limits.get(category, 1),
            )
            if summary:
                parts.append(f"[{section_labels[category]}] {summary}")
        return " ".join(part for part in parts if part)

    def generate_briefing(self, briefing_input: dict[str, Any]) -> dict[str, Any]:
        if not self._available:
            return self._error_result("Ollama not reachable")

        date = briefing_input.get("date", "")
        session_overview = briefing_input.get("session") or {}
        category_summaries: dict[str, str] = {}

        for category in self.CATEGORY_ORDER:
            items = briefing_input.get(category, [])
            try:
                logger.info("Briefing map: %s (%d items)", category, len(items))
                category_summaries[category] = self._summarize_category(category, items)
            except Exception as exc:
                logger.warning("Briefing map failed for %s: %s", category, exc)
                category_summaries[category] = ""

        try:
            logger.info("Briefing reduce: synthesizing %d categories", len(category_summaries))
            body = self._synthesize(
                date,
                session_overview,
                category_summaries,
                briefing_input.get("models", []),
            )
        except Exception as exc:
            logger.warning("Briefing synthesis failed: %s", exc)
            return self._error_result(str(exc))

        return {
            "body_en": compact_text(body, 5000),
            "category_summaries": category_summaries,
            "error": None,
            "run_meta": {
                "model_name": self.model_name,
                "prompt_version": self.prompt_version,
                "generated_at": now_utc_iso(),
            },
        }

    def _error_result(self, reason: str) -> dict[str, Any]:
        return {
            "body_en": None,
            "category_summaries": {},
            "error": reason,
            "run_meta": {
                "model_name": self.model_name,
                "prompt_version": self.prompt_version,
                "generated_at": now_utc_iso(),
            },
        }

    def __del__(self) -> None:  # pragma: no cover
        try:
            self.close()
        except Exception:
            pass


def build_briefing_generator() -> BriefingGenerator | None:
    provider_name = (
        os.environ.get(BRIEFING_PROVIDER_ENV_VAR) or DEFAULT_BRIEFING_PROVIDER
    ).strip().lower()
    if provider_name in {"", "off", "none", "disabled", "false", "0"}:
        return None
    if provider_name != "ollama":
        logger.warning("Unknown briefing provider: %s", provider_name)
        return None
    try:
        generator = BriefingGenerator()
        if not generator.available:
            generator.close()
            return None
        return generator
    except Exception as exc:
        logger.warning("Failed to initialize BriefingGenerator: %s", exc)
        return None
