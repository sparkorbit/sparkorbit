import type {
  DashboardResponse,
  SessionArenaBoard,
  SessionArenaBoardEntry,
} from "../../types/dashboard";

const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  papers: "Papers",
  models: "Models",
  community: "Community",
  company: "Company",
  company_kr: "Company KR",
  company_cn: "Company CN",
  benchmark: "Rank Feed",
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

export const EMPTY_DASHBOARD: DashboardResponse = {
  brand: {
    name: "BLACKSITE",
    tagline: "Link Offline",
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
        label: "sweeps",
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
        role: "Populates summaries and sweeps.",
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
  },
  summary: {
    title: "Signal Sweep",
    headline: "Waiting for link handshake.",
    digests: [],
  },
  feeds: [],
};

export function buildPanelSessionLabel(
  sessionDate: string,
  windowLabel: string,
) {
  const compactDate =
    sessionDate.length >= 10
      ? sessionDate.slice(5, 10).replace("-", ".") +
        (sessionDate.length >= 16 ? " " + sessionDate.slice(11, 16) : "")
      : sessionDate;
  return `${compactDate} / ${windowLabel}`;
}

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
  const normalized = value?.trim();
  if (!normalized) {
    return "-";
  }
  return labels[normalized] ?? humanizeCode(normalized);
}

export function formatSourceCategory(value: string | null | undefined) {
  return formatMappedValue(value, SOURCE_CATEGORY_LABELS);
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
