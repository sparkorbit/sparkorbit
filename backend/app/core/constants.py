from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SOURCE_FETCH_SCRIPTS_DIR = ROOT_DIR / "pipelines" / "source_fetch" / "scripts"
DEFAULT_RUNS_DIR = ROOT_DIR / "pipelines" / "source_fetch" / "data" / "runs"

SESSION_PREFIX = "sparkorbit:session"
ACTIVE_SESSION_KEY = f"{SESSION_PREFIX}:active"
RECENT_SESSIONS_KEY = f"{SESSION_PREFIX}:recent"
QUEUE_SESSION_ENRICH_KEY = "sparkorbit:queue:session_enrich"
SESSION_TTL_SECONDS = 72 * 60 * 60



def env_int(name: str, default: int, *, minimum: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None:
        value = default
    else:
        try:
            value = int(raw)
        except ValueError:
            value = default
    if minimum is not None:
        value = max(minimum, value)
    return value


SESSION_RETAIN_COUNT = env_int(
    "SPARKORBIT_SESSION_RETAIN_COUNT",
    2,
    minimum=1,
)

SCHEMA_VERSION = 3
DEFAULT_RUN_LABEL = "redis-session"
HOMEPAGE_BOOTSTRAP_RUN_LABEL = "homepage-entry"

DEFAULT_REDIS_URL = os.getenv("SPARKORBIT_REDIS_URL", "redis://127.0.0.1:6380/0")
DEFAULT_API_HOST = "127.0.0.1"
DEFAULT_API_PORT = 8787
SUMMARY_PROVIDER_ENV_VAR = "SPARKORBIT_SUMMARY_PROVIDER"
DEFAULT_SUMMARY_PROVIDER = "noop"
BRIEFING_PROVIDER_ENV_VAR = "SPARKORBIT_BRIEFING_PROVIDER"
DEFAULT_BRIEFING_PROVIDER = "off"

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "60"))
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "131072"))
OLLAMA_TEMPERATURE = float(os.getenv("OLLAMA_TEMPERATURE", "0.7"))
OLLAMA_TOP_P = float(os.getenv("OLLAMA_TOP_P", "0.8"))
OLLAMA_TOP_K = int(os.getenv("OLLAMA_TOP_K", "20"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
BRIEFING_PROMPT_PACKS = {
    "papers": ROOT_DIR / "docs" / "prompt_packs" / "briefing_papers_v1.md",
    "company": ROOT_DIR / "docs" / "prompt_packs" / "briefing_company_v1.md",
    "models": ROOT_DIR / "docs" / "prompt_packs" / "briefing_models_v1.md",
    "community": ROOT_DIR / "docs" / "prompt_packs" / "briefing_community_v1.md",
}

SOURCE_CATEGORY_LABELS = {
    "papers": "Papers",
    "models": "Models",
    "community": "Community",
    "company": "Company",
    "company_kr": "Company KR",
    "company_cn": "Company CN",
    "benchmark": "Rank Feed",
}

ORDERED_SOURCE_CATEGORIES = (
    "papers",
    "models",
    "community",
    "company",
    "company_kr",
    "company_cn",
    "benchmark",
)
