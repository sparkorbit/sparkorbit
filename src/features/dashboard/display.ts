import type {
  DashboardResponse,
  SessionArenaBoard,
  SessionArenaBoardEntry,
} from "../../types/dashboard";
import type { JobProgressSnapshot } from "../../types/jobProgress";

const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  papers: "Papers",
  models: "Models",
  community: "Community",
  company: "Company",
  company_kr: "Company KR",
  company_cn: "Company CN",
  benchmark: "Model Rankings",
};

const SOURCE_CATEGORY_TITLE_LABELS: Record<string, string> = {
  papers: "Paper",
  models: "Model",
  community: "Community",
  company: "Company",
  company_kr: "Company KR",
  company_cn: "Company CN",
  benchmark: "Benchmark",
};

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  amazon_science: "Amazon Science",
  anthropic_news: "Anthropic News",
  apple_ml: "Apple ML",
  arxiv_rss_cs_ai: "ARXIV - AI",
  arxiv_rss_cs_cl: "ARXIV - Language AI",
  arxiv_rss_cs_cr: "ARXIV - Security",
  arxiv_rss_cs_cv: "ARXIV - Vision",
  arxiv_rss_cs_ir: "ARXIV - Search and Retrieval",
  arxiv_rss_cs_lg: "ARXIV - Machine Learning",
  arxiv_rss_cs_ro: "ARXIV - Robotics",
  arxiv_rss_stat_ml: "ARXIV - Statistics and ML",
  deepmind_blog: "Google DeepMind News",
  deepseek_updates: "DeepSeek Updates",
  github_bytedance_repos: "ByteDance GitHub",
  github_curated_repos: "GitHub Curated Repos",
  github_mindspore_repos: "MindSpore GitHub",
  github_paddlepaddle_repos: "PaddlePaddle GitHub",
  github_tencent_hunyuan_repos: "Tencent Hunyuan GitHub",
  google_ai_blog: "Google AI News",
  groq_newsroom: "Groq News",
  hf_blog: "Hugging Face Blog",
  hf_daily_papers: "Hugging Face Daily Papers",
  hf_models_likes: "Hugging Face Top Liked Models",
  hf_models_new: "Hugging Face New Models",
  hf_trending_models: "Hugging Face Trending Models",
  hn_topstories: "Hacker News Top Stories",
  kakao_tech_rss: "Kakao Tech",
  lg_ai_research_blog: "LG AI Research Blog",
  lmarena_overview: "Model Rankings",
  microsoft_research: "Microsoft Research",
  mistral_news: "Mistral AI News",
  naver_cloud_blog_rss: "NAVER Cloud Blog",
  nvidia_deep_learning: "NVIDIA Deep Learning",
  open_llm_leaderboard: "Open LLM Leaderboard",
  openai_news_rss: "OpenAI News",
  qwen_blog_rss: "Qwen Blog",
  reddit_localllama: "Reddit - LocalLLaMA",
  reddit_machinelearning: "Reddit - MachineLearning",
  salesforce_ai_research_rss: "Salesforce AI Research",
  samsung_research_posts: "Samsung Research",
  stability_news: "Stability AI News",
  upstage_blog: "Upstage Blog",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  paper: "Paper",
  blog: "Blog",
  news: "News",
  post: "Post",
  story: "Story",
  model: "Model",
  model_trending: "Trending Model",
  repo: "Repo",
  release: "Release",
  release_note: "Release Note",
  benchmark: "Rank Row",
  benchmark_panel: "Rank Board",
};

const TEXT_SCOPE_LABELS: Record<string, string> = {
  full_text: "Full Text",
  abstract: "Abstract",
  excerpt: "Excerpt",
  metadata_only: "Metadata Only",
  metric_summary: "Metric Readout",
  generated_panel: "Generated Trace",
  empty: "Empty",
};

const TIME_SEMANTICS_LABELS: Record<string, string> = {
  published: "Published",
  updated: "Updated",
  created: "Created",
  snapshot: "Snapshot",
  submission: "Submission",
};

const TIMESTAMP_KIND_LABELS: Record<string, string> = {
  published: "Published",
  updated: "Updated",
  created: "Created",
  snapshot: "Snapshot",
  submission: "Submission",
};

const BENCHMARK_KIND_LABELS: Record<string, string> = {
  leaderboard_panel: "Rank Board",
  leaderboard_model_row: "Rank Row",
};

export const EMPTY_ARENA_BOARDS: readonly SessionArenaBoard[] = [];

const EMPTY_LOADING: JobProgressSnapshot = {
  job_id: null,
  surface: "dashboard",
  job_type: "session_loading",
  status: "error",
  stage: "error",
  stage_label: "Error",
  detail: "Waiting for a reachable dashboard session.",
  percent: 0,
  steps: [
    { id: "prepare", label: "Prepare", status: "error" },
    { id: "collect", label: "Collect Sources", status: "pending" },
    { id: "artifacts", label: "Write Artifacts", status: "pending" },
    { id: "publish_docs", label: "Publish Docs", status: "pending" },
    { id: "publish_views", label: "Publish Views", status: "pending" },
    { id: "summaries", label: "Summaries", status: "pending" },
    { id: "labels", label: "LLM Labels", status: "pending" },
    { id: "digests", label: "Digests", status: "pending" },
    { id: "briefing", label: "Briefing", status: "pending" },
  ],
  source_counts: {
    completed: 0,
    total: 0,
    active: 0,
    error: 0,
    skipped: 0,
  },
  document_counts: {
    completed: 0,
    total: 0,
    error: 0,
  },
  task_counts: {
    completed: 0,
    total: 0,
    error: 0,
  },
  current_work_item: null,
  active_work_items: [],
  recent_completed_items: [],
  session_id: null,
  run_id: null,
  started_at: null,
  updated_at: null,
  finished_at: null,
  error: null,
};

export const EMPTY_DASHBOARD: DashboardResponse = {
  brand: {
    name: "AI World Monitor",
    tagline: "AI World Monitor",
  },
  status: "error",
  session: {
    title: "Relay Cache",
    sessionId: "unavailable",
    sessionDate: "unknown",
    window: "live scan",
    reloadRule: "Display will resume once a direct connection is restored.",
    metrics: [
      {
        label: "sources",
        value: "0",
        note: "Cannot read feed count until the link is up.",
      },
      {
        label: "docs",
        value: "0",
        note: "No active cache or link is disconnected.",
      },
      {
        label: "summaries",
        value: "no",
        note: "Materialized view has not been read yet.",
      },
    ],
    runtime: [
      {
        name: "collector",
        role: "Collector scrapes raw source signals.",
        status: "waiting",
      },
      {
        name: "enricher",
        role: "Builds summaries after collection.",
        status: "waiting",
      },
      {
        name: "redis",
        role: "Cache relay must be alive for the display to populate.",
        status: "offline",
      },
      {
        name: "ui",
        role: "UI renders only relay API responses.",
        status: "waiting",
      },
    ],
    rules: [
      "Display reads only from the relay API.",
      "Detail panel renders server payload as-is.",
      "Cold boot starts automatically when no active cache exists.",
    ],
    arenaOverview: null,
    loading: EMPTY_LOADING,
  },
  summary: {
    title: "Today in AI",
    headline: "Waiting to connect.",
    digests: [],
  },
  feeds: [],
};

export function compactText(value: string | null | undefined, maxLength = 160) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function humanizeCode(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return "-";
  }

  return normalized
    .split("_")
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ai", "hf", "hn", "kr", "cn", "llm"].includes(lower)) {
        return lower.toUpperCase();
      }
      if (lower === "rss") {
        return "RSS";
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function formatMappedValue(
  value: string | null | undefined,
  labels: Record<string, string>,
) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "-";
  }
  return labels[normalized] ?? humanizeCode(normalized);
}

export function formatSourceCategory(value: string | null | undefined) {
  return formatMappedValue(value, SOURCE_CATEGORY_LABELS);
}

export function formatSourceCategoryTitle(value: string | null | undefined) {
  return formatMappedValue(value, SOURCE_CATEGORY_TITLE_LABELS);
}

export function formatReadableSourceName(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "-";
  }
  return SOURCE_DISPLAY_NAMES[normalized] ?? humanizeCode(normalized.replace(/_rss\b/g, ""));
}

export function formatReadableSourceTitle(
  sourceCategory: string | null | undefined,
  source: string | null | undefined,
) {
  const readableSource = formatReadableSourceName(source);
  if (readableSource === "-") {
    return formatSourceCategoryTitle(sourceCategory);
  }
  return readableSource;
}

export function formatDisplayDate(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  return compactText(normalized, 10);
}

export function formatDocType(value: string | null | undefined) {
  return formatMappedValue(value, DOC_TYPE_LABELS);
}

export function formatTextScope(value: string | null | undefined) {
  return formatMappedValue(value, TEXT_SCOPE_LABELS);
}

export function formatTimeSemantics(value: string | null | undefined) {
  return formatMappedValue(value, TIME_SEMANTICS_LABELS);
}

export function formatTimestampKind(value: string | null | undefined) {
  return formatMappedValue(value, TIMESTAMP_KIND_LABELS);
}

export function formatBenchmarkKind(value: string | null | undefined) {
  return formatMappedValue(value, BENCHMARK_KIND_LABELS);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatLeaderboardValue(value: unknown) {
  const numeric = toNumber(value);
  if (numeric == null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
  }).format(numeric);
}

export function formatBenchmarkUnit(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "-";
  }
  if (value === "elo_like_rating") {
    return "Elo-like rating";
  }
  if (value === "leaderboard_points") {
    return "Leaderboard points";
  }
  if (value === "%" || value === "percent") {
    return "%";
  }
  return humanizeCode(value);
}

export function formatBenchmarkScore(
  label: string | null | undefined,
  value: unknown,
  unit: unknown,
) {
  const formattedValue = formatLeaderboardValue(value);
  if (formattedValue === "-") {
    return "-";
  }

  const suffix = unit === "%" || unit === "percent" ? "%" : "";
  return `${label?.trim() || "Score"} ${formattedValue}${suffix}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null);
}

export function hasRenderableValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasRenderableValue(item));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      hasRenderableValue(item),
    );
  }
  return true;
}

export function formatDetailValue(value: unknown): string {
  if (value == null) {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value.trim() || "-";
  }
  if (Array.isArray(value)) {
    const flattened: string[] = value
      .map((entry) => formatDetailValue(entry))
      .filter((entry) => entry !== "-");
    return flattened.length > 0 ? flattened.join(", ") : "-";
  }
  return compactText(JSON.stringify(value), 180) || "-";
}

export function toRenderableStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => formatDetailValue(entry))
    .filter((entry) => entry !== "-");
}

export function buildLeaderboardEntries(
  board: SessionArenaBoard | null,
): SessionArenaBoardEntry[] {
  if (!board) {
    return [];
  }

  if (board.topEntries.length > 0) {
    return board.topEntries;
  }

  return board.topModel.modelName ? [board.topModel] : [];
}

export function loadingStepClasses(
  status: JobProgressSnapshot["steps"][number]["status"],
) {
  switch (status) {
    case "active":
      return "border-orbit-accent bg-orbit-panel text-orbit-text";
    case "complete":
      return "border-orbit-border-strong bg-orbit-bg text-orbit-accent";
    case "error":
      return "border-red-500/40 bg-red-950/20 text-red-200";
    case "pending":
    default:
      return "border-orbit-border bg-orbit-bg text-orbit-muted";
  }
}
