import type {
  DashboardLoading,
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
    reloadRule: "직접 연결이 복구되면 화면이 다시 깨어납니다.",
    metrics: [
      {
        label: "sources",
        value: "0",
        note: "링크가 살아나기 전에는 feed count를 읽을 수 없습니다.",
      },
      {
        label: "docs",
        value: "0",
        note: "활성 캐시가 없거나 링크가 끊어졌습니다.",
      },
      {
        label: "sweeps",
        value: "no",
        note: "materialized view를 아직 읽지 못했습니다.",
      },
    ],
    runtime: [
      {
        name: "collector",
        role: "collector가 원문 신호를 긁어옵니다.",
        status: "waiting",
      },
      {
        name: "enricher",
        role: "요약과 sweep를 채웁니다.",
        status: "waiting",
      },
      {
        name: "redis",
        role: "cache relay가 살아 있어야 화면이 채워집니다.",
        status: "offline",
      },
      {
        name: "ui",
        role: "화면은 relay API 응답만 렌더링합니다.",
        status: "waiting",
      },
    ],
    rules: [
      "화면은 relay API만 읽습니다.",
      "detail 패널은 서버 payload만 그대로 보여줍니다.",
      "활성 캐시가 없으면 cold boot가 자동으로 시작됩니다.",
    ],
    arenaOverview: null,
    loading: null,
  },
  summary: {
    title: "Signal Sweep",
    headline: "link handshake를 기다리는 중입니다.",
    digests: [],
  },
  feeds: [],
};

export function buildPanelSessionLabel(sessionDate: string, windowLabel: string) {
  const compactDate =
    sessionDate.length >= 10
      ? sessionDate.slice(5).replace("-", ".")
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

export function loadingStepClasses(
  status: DashboardLoading["steps"][number]["status"],
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
