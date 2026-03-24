from __future__ import annotations

from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SOURCE_FETCH_SCRIPTS_DIR = ROOT_DIR / "PoC" / "source_fetch" / "scripts"
DEFAULT_RUNS_DIR = ROOT_DIR / "PoC" / "source_fetch" / "data" / "runs"

SESSION_PREFIX = "sparkorbit:session"
ACTIVE_SESSION_KEY = f"{SESSION_PREFIX}:active"
BOOTSTRAP_STATE_KEY = f"{SESSION_PREFIX}:bootstrap_state"
RELOAD_STATE_KEY = f"{SESSION_PREFIX}:reload_state"
QUEUE_SESSION_ENRICH_KEY = "sparkorbit:queue:session_enrich"
SESSION_TTL_SECONDS = 72 * 60 * 60
BOOTSTRAP_STATE_TTL_SECONDS = 15 * 60
RELOAD_STATE_TTL_SECONDS = 15 * 60
SCHEMA_VERSION = 1
DEFAULT_COLLECTION_PROFILE = "full"
DEFAULT_RUN_LABEL = "redis-session"
HOMEPAGE_BOOTSTRAP_RUN_LABEL = "homepage-entry"

DEFAULT_REDIS_URL = "redis://127.0.0.1:6379/0"
DEFAULT_API_HOST = "127.0.0.1"
DEFAULT_API_PORT = 8787
SUMMARY_PROVIDER_ENV_VAR = "SPARKORBIT_SUMMARY_PROVIDER"
DEFAULT_SUMMARY_PROVIDER = "noop"

SOURCE_CATEGORY_LABELS = {
    "papers": "Papers",
    "community": "Community",
    "company": "Company",
    "company_kr": "Company KR",
    "company_cn": "Company CN",
    "benchmark": "Benchmark",
}

ORDERED_SOURCE_CATEGORIES = (
    "papers",
    "community",
    "company",
    "company_kr",
    "company_cn",
    "benchmark",
)
