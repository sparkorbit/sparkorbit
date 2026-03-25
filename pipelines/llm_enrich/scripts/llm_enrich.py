from __future__ import annotations

import argparse
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx


DEFAULT_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.5:4b")
DEFAULT_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "180"))
DEFAULT_TEMPERATURE = float(os.environ.get("OLLAMA_TEMPERATURE", "0.7"))
DEFAULT_NUM_CTX = int(os.environ.get("OLLAMA_NUM_CTX", "8192"))
DEFAULT_TOP_P = float(os.environ.get("OLLAMA_TOP_P", "0.8"))
DEFAULT_TOP_K = int(os.environ.get("OLLAMA_TOP_K", "20"))
DEFAULT_MIN_P = float(os.environ.get("OLLAMA_MIN_P", "0.0"))
DEFAULT_REPEAT_PENALTY = float(os.environ.get("OLLAMA_REPEAT_PENALTY", "1.0"))
DEFAULT_RUNS_ROOT = Path(__file__).resolve().parents[2] / "source_fetch" / "data" / "runs"
LABELS_DIRNAME = "labels"
COMPANY_DECISIONS_FILENAME = "company_decisions.ndjson"
REVIEW_QUEUE_FILENAME = "review_queue.ndjson"
LLM_RUNS_FILENAME = "llm_runs.ndjson"

PROMPT_VERSION = "company_filter_v2"
SCHEMA_VERSION = "document_filter_v2"

COMPANY_DOMAINS = [
    "model_release",
    "product_update",
    "technical_research",
    "open_source",
    "benchmark_eval",
    "partnership_ecosystem",
    "policy_safety",
    "others",
]

DEFAULT_PROMPT_PACK = (
    Path(__file__).resolve().parents[3] / "docs" / "prompt_packs" / "company_filter_v2.md"
)

REASON_CODES = [
    "model_signal",
    "product_signal",
    "research_signal",
    "oss_signal",
    "benchmark_signal",
    "partnership_signal",
    "policy_signal",
    "other_signal",
    "event_or_program",
    "recruiting_or_pr",
    "general_promo",
    "unclear_scope",
    "runtime_fallback",
]

OLLAMA_FORMAT_SCHEMA: dict[str, Any] = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "document_id": {"type": "string"},
            "decision": {
                "type": "string",
                "enum": ["keep", "drop", "needs_review"],
            },
            "company_domain": {
                "anyOf": [
                    {"type": "string", "enum": COMPANY_DOMAINS},
                    {"type": "null"},
                ]
            },
            "reason_code": {"type": "string", "enum": REASON_CODES},
        },
        "required": [
            "document_id",
            "decision",
            "company_domain",
            "reason_code",
        ],
        "additionalProperties": False,
    },
}


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def extract_markdown_code_block(markdown_text: str, info_string: str) -> str:
    pattern = rf"```{re.escape(info_string)}\n(.*?)\n```"
    match = re.search(pattern, markdown_text, re.DOTALL)
    if not match:
        raise ValueError(f"Missing fenced code block: {info_string}")
    return match.group(1).strip()


def load_prompt_pack(path: Path) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"Prompt pack not found: {path}")
    markdown_text = path.read_text(encoding="utf-8")
    return {
        "system_prompt": extract_markdown_code_block(markdown_text, "prompt-system"),
        "user_prompt_template": extract_markdown_code_block(markdown_text, "prompt-user-template"),
    }


def append_ndjson(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_documents(run_dir: Path) -> list[dict[str, Any]]:
    documents_path = run_dir / "normalized" / "documents.ndjson"
    if not documents_path.exists():
        raise FileNotFoundError(f"Missing normalized documents: {documents_path}")
    documents: list[dict[str, Any]] = []
    with documents_path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                documents.append(json.loads(line))
    return documents


def latest_run_dir(root: Path) -> Path:
    if not root.exists():
        raise FileNotFoundError(f"Run root does not exist: {root}")
    candidates = sorted(path for path in root.iterdir() if path.is_dir())
    if not candidates:
        raise FileNotFoundError(f"No run directories found under: {root}")
    return candidates[-1]


def company_candidates(
    documents: list[dict[str, Any]],
    *,
    per_source: int = 5,
    max_age_days: int | None = 90,
) -> list[dict[str, Any]]:
    # Filter eligible documents
    eligible: list[dict[str, Any]] = []
    cutoff: datetime | None = None
    if max_age_days is not None and max_age_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    for document in documents:
        source = document.get("source") or ""
        source_category = document.get("source_category")
        text_scope = document.get("text_scope")
        if source.startswith("github_"):
            continue
        if source_category not in {"company", "company_kr", "company_cn"} and source != "hf_blog":
            continue
        if text_scope in {"empty", "metric_summary", "generated_panel"}:
            continue
        if cutoff is not None:
            published = parse_iso_datetime(document.get("published_at") or document.get("sort_at"))
            if published is None or published < cutoff:
                continue
        eligible.append(document)

    # Keep only the most recent N per source
    buckets: dict[str, list[dict[str, Any]]] = {}
    for doc in eligible:
        src = doc.get("source") or "unknown"
        buckets.setdefault(src, []).append(doc)

    selected: list[dict[str, Any]] = []
    for src, docs in buckets.items():
        docs.sort(key=lambda d: d.get("sort_at") or d.get("published_at") or "", reverse=True)
        selected.extend(docs[:per_source])

    # Sort final list by sort_at for consistent ordering
    selected.sort(key=lambda d: d.get("sort_at") or "", reverse=True)
    return selected


def sample_candidates(
    documents: list[dict[str, Any]],
    *,
    limit: int | None,
    mode: str,
) -> list[dict[str, Any]]:
    if limit is None or limit >= len(documents):
        return documents
    if mode == "first":
        return documents[:limit]
    if mode != "round_robin_source":
        raise ValueError(f"Unsupported sample mode: {mode}")

    buckets: dict[str, list[dict[str, Any]]] = {}
    order: list[str] = []
    for document in documents:
        source = document.get("source") or "unknown"
        if source not in buckets:
            buckets[source] = []
            order.append(source)
        buckets[source].append(document)

    sampled: list[dict[str, Any]] = []
    bucket_index = 0
    while len(sampled) < limit and order:
        source = order[bucket_index % len(order)]
        bucket = buckets[source]
        if bucket:
            sampled.append(bucket.pop(0))
        if not bucket:
            order.remove(source)
            if not order:
                break
            bucket_index -= 1
        bucket_index += 1
    return sampled


def excerpt_for_prompt(document: dict[str, Any], max_chars: int = 200) -> str:
    """Excerpt for classification — enough context to resolve ambiguous titles."""
    desc = (document.get("description") or "").strip()
    if desc:
        return desc[:max_chars]
    body = (document.get("body_text") or "").strip()
    if body:
        return body[:max_chars]
    return ""


def build_prompt_items(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Minimal input per doc to keep prompt short and batch large."""
    items: list[dict[str, Any]] = []
    for document in documents:
        item: dict[str, Any] = {
            "id": document.get("document_id"),
            "src": document.get("source"),
            "title": document.get("title"),
        }
        excerpt = excerpt_for_prompt(document)
        if excerpt:
            item["desc"] = excerpt
        items.append(item)
    return items


def validate_chunk_results(
    rows: Any,
    expected_documents: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        raise ValueError(f"Expected list response, got {type(rows).__name__}")

    expected_ids = [document["document_id"] for document in expected_documents]
    expected_set = set(expected_ids)
    seen_ids: set[str] = set()
    validated: list[dict[str, Any]] = []

    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Each result row must be an object")
        document_id = row.get("document_id")
        decision = row.get("decision")
        company_domain = row.get("company_domain")
        reason_code = row.get("reason_code")

        if document_id not in expected_set:
            raise ValueError(f"Unexpected document_id in output: {document_id}")
        if document_id in seen_ids:
            raise ValueError(f"Duplicate document_id in output: {document_id}")
        if decision not in {"keep", "drop", "needs_review"}:
            raise ValueError(f"Invalid decision for {document_id}: {decision}")
        if company_domain is not None and company_domain not in COMPANY_DOMAINS:
            raise ValueError(f"Invalid company_domain for {document_id}: {company_domain}")
        if decision == "drop" and company_domain is not None:
            raise ValueError(f"Drop result must use null company_domain for {document_id}")
        if not isinstance(reason_code, str) or reason_code not in REASON_CODES:
            raise ValueError(f"Invalid reason_code for {document_id}: {reason_code}")

        seen_ids.add(document_id)
        validated.append(
            {
                "document_id": document_id,
                "filter_scope": "company_panel",
                "decision": decision,
                "company_domain": company_domain,
                "reason_code": reason_code,
            }
        )

    if seen_ids != expected_set:
        missing = sorted(expected_set - seen_ids)
        raise ValueError(f"Missing document_ids in output: {missing}")

    return validated


class OllamaClient:
    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout_seconds: float,
        temperature: float,
        num_ctx: int,
        top_p: float,
        top_k: int,
        min_p: float,
        repeat_penalty: float,
        keep_alive: str,
        system_prompt: str,
        user_prompt_template: str,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.num_ctx = num_ctx
        self.top_p = top_p
        self.top_k = top_k
        self.min_p = min_p
        self.repeat_penalty = repeat_penalty
        self.keep_alive = keep_alive
        self.system_prompt = system_prompt
        self.user_prompt_template = user_prompt_template
        self.http = httpx.Client(timeout=timeout_seconds)

    def close(self) -> None:
        self.http.close()

    def ping(self) -> None:
        response = self.http.get(f"{self.base_url}/api/tags")
        response.raise_for_status()

    def classify_company_chunk(self, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        prompt_items = build_prompt_items(documents)
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {
                    "role": "user",
                    "content": self.user_prompt_template.format(
                        documents_json=json.dumps(prompt_items, ensure_ascii=False)
                    ),
                },
            ],
            "format": OLLAMA_FORMAT_SCHEMA,
            "stream": False,
            "think": False,
            "keep_alive": self.keep_alive,
            "options": {
                "temperature": self.temperature,
                "top_p": self.top_p,
                "top_k": self.top_k,
                "min_p": self.min_p,
                "repeat_penalty": self.repeat_penalty,
                "num_ctx": self.num_ctx,
            },
        }
        response = self.http.post(f"{self.base_url}/api/chat", json=payload)
        response.raise_for_status()
        body = response.json()
        message = body.get("message") or {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Ollama response did not contain message.content")
        try:
            decoded = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Could not parse JSON from Ollama response: {exc}") from exc
        return validate_chunk_results(decoded, documents)


def fallback_rows(
    documents: list[dict[str, Any]],
    *,
    model_name: str,
    runtime: str,
    prompt_version: str,
    schema_version: str,
    reason: str,
) -> list[dict[str, Any]]:
    generated_at = now_utc_iso()
    rows: list[dict[str, Any]] = []
    for document in documents:
        rows.append(
            {
                "document_id": document["document_id"],
                "filter_scope": "company_panel",
                "decision": "needs_review",
                "company_domain": None,
                "reason_code": "runtime_fallback",
                "model_name": model_name,
                "runtime": runtime,
                "prompt_version": prompt_version,
                "schema_version": schema_version,
                "generated_at": generated_at,
                "failure_reason": reason,
            }
        )
    return rows


def classify_with_retry(
    client: OllamaClient,
    documents: list[dict[str, Any]],
    *,
    model_name: str,
    runtime: str,
    prompt_version: str,
    schema_version: str,
    stats: dict[str, int],
) -> list[dict[str, Any]]:
    stats["requests"] += 1
    try:
        generated_at = now_utc_iso()
        rows = client.classify_company_chunk(documents)
        for row in rows:
            row["model_name"] = model_name
            row["runtime"] = runtime
            row["prompt_version"] = prompt_version
            row["schema_version"] = schema_version
            row["generated_at"] = generated_at
        return rows
    except Exception:
        if len(documents) == 1:
            stats["fallback_items"] += 1
            return fallback_rows(
                documents,
                model_name=model_name,
                runtime=runtime,
                prompt_version=prompt_version,
                schema_version=schema_version,
                reason="fallback_after_parse_or_validation_failure",
            )

        stats["split_retries"] += 1
        middle = len(documents) // 2
        left = classify_with_retry(
            client,
            documents[:middle],
            model_name=model_name,
            runtime=runtime,
            prompt_version=prompt_version,
            schema_version=schema_version,
            stats=stats,
        )
        right = classify_with_retry(
            client,
            documents[middle:],
            model_name=model_name,
            runtime=runtime,
            prompt_version=prompt_version,
            schema_version=schema_version,
            stats=stats,
        )
        return left + right


def write_outputs(
    run_dir: Path,
    rows: list[dict[str, Any]],
    stats: dict[str, int],
    *,
    model_name: str,
    runtime: str,
    base_url: str,
    chunk_size: int,
    started_at: str,
) -> None:
    labels_dir = run_dir / LABELS_DIRNAME
    labels_dir.mkdir(parents=True, exist_ok=True)

    decisions_path = labels_dir / COMPANY_DECISIONS_FILENAME
    review_queue_path = labels_dir / REVIEW_QUEUE_FILENAME
    llm_runs_path = labels_dir / LLM_RUNS_FILENAME

    decisions_path.write_text("", encoding="utf-8")
    review_queue_path.write_text("", encoding="utf-8")

    append_ndjson(decisions_path, rows)
    review_queue_rows = [row for row in rows if row.get("decision") == "needs_review"]
    append_ndjson(review_queue_path, review_queue_rows)

    run_row = {
        "phase": "company_filter",
        "runtime": runtime,
        "base_url": base_url,
        "model_name": model_name,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "chunk_size": chunk_size,
        "started_at": started_at,
        "finished_at": now_utc_iso(),
        "request_count": stats["requests"],
        "split_retries": stats["split_retries"],
        "fallback_items": stats["fallback_items"],
        "output_count": len(rows),
        "needs_review_count": len(review_queue_rows),
    }
    append_ndjson(llm_runs_path, [run_row])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run company-panel LLM decisions via local Ollama.")
    parser.add_argument(
        "--run-dir",
        help="Run directory path. If omitted, the latest source_fetch run is used.",
    )
    parser.add_argument(
        "--runs-root",
        default=str(DEFAULT_RUNS_ROOT),
        help="Root directory containing source_fetch run outputs. Default: pipelines/source_fetch/data/runs",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Ollama base URL. Default: http://localhost:11434",
    )
    parser.add_argument(
        "--prompt-pack",
        default=str(DEFAULT_PROMPT_PACK),
        help="Markdown prompt pack path. Default: docs/prompt_packs/company_filter_v2.md",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="Ollama model name. Default: qwen3.5:4b",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=30,
        help="Number of documents per batch before split retries. Default: 30",
    )
    parser.add_argument(
        "--per-source",
        type=int,
        default=5,
        help="Max recent documents per source. Default: 5",
    )
    parser.add_argument(
        "--max-age-days",
        type=int,
        default=90,
        help="Only include documents from the last N days using published_at/sort_at. Use 0 to disable. Default: 90",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help="HTTP timeout seconds. Default: 180",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=DEFAULT_TEMPERATURE,
        help="Sampling temperature. HF non-thinking baseline default: 0.7",
    )
    parser.add_argument(
        "--num-ctx",
        type=int,
        default=DEFAULT_NUM_CTX,
        help="Requested Ollama context length. Default: 8192",
    )
    parser.add_argument(
        "--top-p",
        type=float,
        default=DEFAULT_TOP_P,
        help="Sampling top_p. HF non-thinking baseline default: 0.8",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=DEFAULT_TOP_K,
        help="Sampling top_k. HF non-thinking baseline default: 20",
    )
    parser.add_argument(
        "--min-p",
        type=float,
        default=DEFAULT_MIN_P,
        help="Sampling min_p. HF non-thinking baseline default: 0.0",
    )
    parser.add_argument(
        "--repeat-penalty",
        type=float,
        default=DEFAULT_REPEAT_PENALTY,
        help="Sampling repeat_penalty. Default: 1.0",
    )
    parser.add_argument(
        "--keep-alive",
        default="30m",
        help="Ollama model keep-alive duration. Default: 30m",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on selected company documents for smoke tests.",
    )
    parser.add_argument(
        "--sample-mode",
        choices=["first", "round_robin_source"],
        default="first",
        help="How to choose limited smoke-test samples. Default: first",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print candidate counts without calling Ollama.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    run_dir = Path(args.run_dir) if args.run_dir else latest_run_dir(Path(args.runs_root))
    documents = load_documents(run_dir)
    max_age_days = args.max_age_days if args.max_age_days > 0 else None
    candidates = company_candidates(
        documents,
        per_source=args.per_source,
        max_age_days=max_age_days,
    )
    candidates = sample_candidates(candidates, limit=args.limit, mode=args.sample_mode)

    print(f"Run dir: {run_dir}")
    print(f"Loaded documents: {len(documents)}")
    print(f"Company candidates: {len(candidates)}")

    if args.dry_run:
        return 0

    if not candidates:
        raise SystemExit("No company candidates found for LLM decisions.")

    started_at = now_utc_iso()
    stats = {"requests": 0, "split_retries": 0, "fallback_items": 0}
    prompt_pack = load_prompt_pack(Path(args.prompt_pack))

    client = OllamaClient(
        base_url=args.base_url,
        model=args.model,
        timeout_seconds=args.timeout,
        temperature=args.temperature,
        num_ctx=args.num_ctx,
        top_p=args.top_p,
        top_k=args.top_k,
        min_p=args.min_p,
        repeat_penalty=args.repeat_penalty,
        keep_alive=args.keep_alive,
        system_prompt=prompt_pack["system_prompt"],
        user_prompt_template=prompt_pack["user_prompt_template"],
    )

    try:
        client.ping()
        rows: list[dict[str, Any]] = []
        total_chunks = (len(candidates) - 1) // args.chunk_size + 1
        for index in range(0, len(candidates), args.chunk_size):
            chunk = candidates[index : index + args.chunk_size]
            chunk_id = index // args.chunk_size + 1
            print(f"Classifying chunk {chunk_id}/{total_chunks} ({len(chunk)} docs)...")
            started = time.time()
            chunk_rows = classify_with_retry(
                client,
                chunk,
                model_name=args.model,
                runtime="ollama",
                prompt_version=PROMPT_VERSION,
                schema_version=SCHEMA_VERSION,
                stats=stats,
            )
            rows.extend(chunk_rows)
            print(f"  done in {time.time() - started:.1f}s")
    except httpx.HTTPError as exc:
        raise SystemExit(
            "Could not reach local Ollama. Start the local server first.\n"
            "Suggested: docker compose -f docker-compose.ollama.yml up -d"
        ) from exc
    finally:
        client.close()

    write_outputs(
        run_dir,
        rows,
        stats,
        model_name=args.model,
        runtime="ollama",
        base_url=args.base_url,
        chunk_size=args.chunk_size,
        started_at=started_at,
    )

    kept = sum(1 for row in rows if row["decision"] == "keep")
    dropped = sum(1 for row in rows if row["decision"] == "drop")
    needs_review = sum(1 for row in rows if row["decision"] == "needs_review")

    print("Done.")
    print(f"  kept: {kept}")
    print(f"  dropped: {dropped}")
    print(f"  needs_review: {needs_review}")
    print(f"  requests: {stats['requests']}")
    print(f"  split_retries: {stats['split_retries']}")
    print(f"  fallback_items: {stats['fallback_items']}")
    print(f"  output: {run_dir / LABELS_DIRNAME / COMPANY_DECISIONS_FILENAME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
