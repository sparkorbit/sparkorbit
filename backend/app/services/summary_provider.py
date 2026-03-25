from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Protocol

import httpx

from ..core.constants import (
    BRIEFING_PROMPT_PACK_PATH,
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


BRIEFING_FORMAT_SCHEMA = {
    "type": "object",
    "properties": {
        "body_en": {"type": "string"},
        "body_kr": {"type": "string"},
    },
    "required": ["body_en", "body_kr"],
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


class BriefingGenerator:
    provider_name = "ollama"
    prompt_version = "daily_briefing_v1"

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

        pack = _load_prompt_pack(BRIEFING_PROMPT_PACK_PATH)
        self.system_prompt = pack["system_prompt"]
        self.user_prompt_template = pack["user_prompt_template"]

        try:
            resp = self.http.get(f"{self.base_url}/api/tags", timeout=5.0)
            resp.raise_for_status()
        except Exception:
            logger.warning(
                "Ollama not reachable at %s — briefing will be skipped",
                self.base_url,
            )
            self._available = False

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

    def generate_briefing(self, briefing_input: dict[str, Any]) -> dict[str, Any]:
        if not self._available:
            return self._error_result("Ollama not reachable")

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {
                    "role": "user",
                    "content": self.user_prompt_template.format(
                        briefing_input_json=json.dumps(
                            briefing_input, ensure_ascii=False
                        )
                    ),
                },
            ],
            "format": BRIEFING_FORMAT_SCHEMA,
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

        try:
            resp = self.http.post(f"{self.base_url}/api/chat", json=payload)
            resp.raise_for_status()
            body = resp.json()
            content = (body.get("message") or {}).get("content", "")
        except Exception as exc:
            logger.warning("Briefing generation failed: %s", exc)
            return self._error_result(str(exc))

        try:
            cleaned = self._strip_markdown_fence(content)
            raw = json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            raw = self._parse_plain_text(content)

        return self._wrap_result(raw)

    @staticmethod
    def _strip_markdown_fence(text: str) -> str:
        stripped = text.strip()
        if stripped.startswith("```"):
            first_newline = stripped.find("\n")
            if first_newline != -1:
                stripped = stripped[first_newline + 1 :]
            if stripped.endswith("```"):
                stripped = stripped[: -3]
        return stripped.strip()

    @staticmethod
    def _parse_plain_text(text: str) -> dict[str, str]:
        return {"body_en": text.strip(), "body_kr": ""}

    def _wrap_result(self, raw: dict[str, Any]) -> dict[str, Any]:
        return {
            "body_en": compact_text(raw.get("body_en") or "", 5000),
            "body_kr": compact_text(raw.get("body_kr") or "", 5000),
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
            "body_kr": None,
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
        return BriefingGenerator()
    except Exception as exc:
        logger.warning("Failed to initialize BriefingGenerator: %s", exc)
        return None
