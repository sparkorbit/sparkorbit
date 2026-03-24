from __future__ import annotations

import os
import re
from typing import Any, Protocol

from ..core.constants import DEFAULT_SUMMARY_PROVIDER, SUMMARY_PROVIDER_ENV_VAR


def now_utc_iso() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


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
            "importance_reason": "Summary provider is not configured yet.",
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
