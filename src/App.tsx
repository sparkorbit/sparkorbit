import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useState,
} from "react";

import {
  PanelWorkspace,
} from "./components/dashboard/PanelWorkspace";
import { SourcePanel } from "./components/dashboard/SourcePanel";
import { SummaryPanel } from "./components/dashboard/SummaryPanel";
import { resetPanelWorkspaceStorage } from "./components/dashboard/panelWorkspaceStorage";
import { shell } from "./components/dashboard/styles";
import type { DigestItem } from "./content/dashboardContent";
import {
  fetchDashboard,
  fetchDigestDetail,
  fetchDocument,
  fetchLeaderboards,
  fetchReloadState,
  openDashboardStream,
  openReloadStream,
  reloadSession,
} from "./lib/dashboardApi";
import type {
  DashboardLoading,
  DashboardResponse,
  DigestDetailResponse,
  SessionArenaBoard,
  SessionArenaBoardEntry,
  SessionArenaOverview,
  SessionReloadStateResponse,
} from "./types/dashboard";
import type { SessionDocument } from "./types/sessionDocument";

type RowHeightMode = "compact" | "standard" | "tall";

type UiSettings = {
  motionEnabled: boolean;
  overlaysEnabled: boolean;
  rowHeightMode: RowHeightMode;
};

type DetailState =
  | {
      kind: "digest";
      payload: DigestDetailResponse;
    }
  | {
      kind: "document";
      payload: SessionDocument;
    }
  | null;

const UI_SETTINGS_STORAGE_KEY = "sparkorbit-ui-settings-v1";
const EMPTY_ARENA_BOARDS: readonly SessionArenaBoard[] = [];

const ROW_HEIGHT_MODE_OPTIONS: Array<{
  id: RowHeightMode;
  label: string;
  note: string;
  rowHeightPx: number;
}> = [
  {
    id: "compact",
    label: "Compact",
    note: "1칸 높이 260px",
    rowHeightPx: 260,
  },
  {
    id: "standard",
    label: "Standard",
    note: "1칸 높이 320px",
    rowHeightPx: 320,
  },
  {
    id: "tall",
    label: "Tall",
    note: "1칸 높이 380px",
    rowHeightPx: 380,
  },
] as const;

const DEFAULT_UI_SETTINGS: UiSettings = {
  motionEnabled: true,
  overlaysEnabled: true,
  rowHeightMode: "standard",
};

const EMPTY_DASHBOARD: DashboardResponse = {
  brand: {
    name: "SparkOrbit",
    tagline: "Backend API Required",
  },
  status: "error",
  session: {
    title: "SparkOrbit Session",
    sessionId: "unavailable",
    sessionDate: "unknown",
    window: "live snapshot",
    reloadRule: "frontend는 BFF API만 사용합니다. backend와 redis가 준비되면 dashboard를 다시 불러옵니다.",
    metrics: [
      {
        label: "sources",
        value: "0",
        note: "backend 연결 전에는 source count를 계산할 수 없습니다.",
      },
      {
        label: "docs",
        value: "0",
        note: "active session이 없거나 API 연결에 실패했습니다.",
      },
      {
        label: "digests",
        value: "no",
        note: "Redis dashboard materialized view를 아직 읽지 못했습니다.",
      },
    ],
    runtime: [
      {
        name: "collector",
        role: "백엔드가 pipelines/source_fetch collection을 실행합니다.",
        status: "waiting",
      },
      {
        name: "enricher",
        role: "백엔드가 문서 요약과 category digest를 생성합니다.",
        status: "waiting",
      },
      {
        name: "redis",
        role: "세션 materialized view를 읽기 위해 Redis 연결이 필요합니다.",
        status: "offline",
      },
      {
        name: "ui",
        role: "frontend는 /api/dashboard와 drill-down API만 사용합니다.",
        status: "waiting",
      },
    ],
    rules: [
      "frontend는 BFF API만 사용합니다.",
      "문서 detail은 backend가 반환한 session document payload만 렌더링합니다.",
      "active session이 없으면 홈페이지 진입 시 backend가 자동 수집을 시작합니다.",
    ],
    arenaOverview: null,
    loading: {
      stage: "error",
      stageLabel: "대기 중",
      detail: "backend API가 준비되면 실제 collection 단계가 표시됩니다.",
      progressCurrent: 0,
      progressTotal: 0,
      percent: 0,
      currentSource: null,
      steps: buildPlaceholderSteps(),
    },
  },
  summary: {
    title: "Category Digest",
    headline: "Backend API를 기다리는 중입니다.",
    digests: [],
  },
  feeds: [],
};

const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  papers: "Papers",
  models: "Models",
  community: "Community",
  company: "Company",
  company_kr: "Company KR",
  company_cn: "Company CN",
  benchmark: "Benchmark",
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
  benchmark: "Leaderboard Row",
  benchmark_panel: "Leaderboard Panel",
};

const TEXT_SCOPE_LABELS: Record<string, string> = {
  full_text: "Full Text",
  abstract: "Abstract",
  excerpt: "Excerpt",
  metadata_only: "Metadata Only",
  metric_summary: "Metric Summary",
  generated_panel: "Generated Panel",
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
  leaderboard_panel: "Leaderboard Panel",
  leaderboard_model_row: "Leaderboard Row",
};

function loadUiSettings(): UiSettings {
  if (typeof window === "undefined") {
    return DEFAULT_UI_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_UI_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    const validRowHeightMode: RowHeightMode =
      typeof parsed.rowHeightMode === "string" &&
      ROW_HEIGHT_MODE_OPTIONS.some(
        (option) => option.id === parsed.rowHeightMode,
      )
        ? parsed.rowHeightMode
        : DEFAULT_UI_SETTINGS.rowHeightMode;

    return {
      motionEnabled:
        typeof parsed.motionEnabled === "boolean"
          ? parsed.motionEnabled
          : DEFAULT_UI_SETTINGS.motionEnabled,
      overlaysEnabled:
        typeof parsed.overlaysEnabled === "boolean"
          ? parsed.overlaysEnabled
          : DEFAULT_UI_SETTINGS.overlaysEnabled,
      rowHeightMode: validRowHeightMode,
    };
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

function buildPanelSessionLabel(sessionDate: string, windowLabel: string) {
  const compactDate =
    sessionDate.length >= 10
      ? sessionDate.slice(5).replace("-", ".")
      : sessionDate;
  return `${compactDate} / ${windowLabel}`;
}

function compactText(value: string | null | undefined, maxLength = 160) {
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

function formatSourceCategory(value: string | null | undefined) {
  return formatMappedValue(value, SOURCE_CATEGORY_LABELS);
}

function formatDocType(value: string | null | undefined) {
  return formatMappedValue(value, DOC_TYPE_LABELS);
}

function formatTextScope(value: string | null | undefined) {
  return formatMappedValue(value, TEXT_SCOPE_LABELS);
}

function formatTimeSemantics(value: string | null | undefined) {
  return formatMappedValue(value, TIME_SEMANTICS_LABELS);
}

function formatTimestampKind(value: string | null | undefined) {
  return formatMappedValue(value, TIMESTAMP_KIND_LABELS);
}

function formatBenchmarkKind(value: string | null | undefined) {
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

function formatLeaderboardValue(value: unknown) {
  const numeric = toNumber(value);
  if (numeric == null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
  }).format(numeric);
}

function formatBenchmarkUnit(value: unknown) {
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

function formatBenchmarkScore(
  label: string | null | undefined,
  value: unknown,
  unit: unknown,
) {
  const formattedValue = formatLeaderboardValue(value);
  if (formattedValue === "-") {
    return "-";
  }

  const suffix =
    unit === "%" || unit === "percent"
      ? "%"
      : "";

  return `${label?.trim() || "Score"} ${formattedValue}${suffix}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null);
}

function toRenderableStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => formatDetailValue(entry))
    .filter((entry) => entry !== "-");
}

function buildLeaderboardEntries(
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

type DetailField = {
  label: string;
  value: string;
  href?: string | null;
};

function hasRenderableValue(value: unknown): boolean {
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

function formatDetailValue(value: unknown): string {
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

function createDetailField(
  label: string,
  value: unknown,
  options?: { href?: string | null },
): DetailField | null {
  if (!hasRenderableValue(value)) {
    return null;
  }
  return {
    label,
    value: formatDetailValue(value),
    href: options?.href ?? null,
  };
}

function filterDetailFields(
  fields: Array<DetailField | null | undefined>,
): DetailField[] {
  return fields.filter((field): field is DetailField => field != null);
}

function buildRecordFields(
  record: Record<string, unknown>,
  options?: {
    maxItems?: number;
    labelTransform?: (key: string) => string;
  },
) {
  return filterDetailFields(
    Object.entries(record)
      .filter(([, value]) => hasRenderableValue(value))
      .slice(0, options?.maxItems ?? 8)
      .map(([key, value]) =>
        createDetailField(
          options?.labelTransform ? options.labelTransform(key) : key,
          value,
        ),
      ),
  );
}

function buildDocumentIdentityFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("document_id", document.document_id),
    createDetailField("run_id", document.run_id),
    createDetailField("source", document.source),
    createDetailField(
      "source_category",
      formatSourceCategory(document.source_category),
    ),
    createDetailField("doc_type", formatDocType(document.doc_type)),
    createDetailField("content_type", formatDocType(document.content_type)),
    createDetailField("source_item_id", document.source_item_id),
    createDetailField("language", document.language),
    createDetailField("content_format", document.content_format),
    createDetailField("text_scope", formatTextScope(document.text_scope)),
    createDetailField(
      "timestamp_kind",
      formatTimestampKind(document.timestamp_kind),
    ),
  ]);
}

function buildDocumentTimeFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("published_at", document.published_at),
    createDetailField("updated_at", document.updated_at),
    createDetailField("sort_at", document.sort_at),
    createDetailField("fetched_at", document.fetched_at),
    createDetailField(
      "time_semantics",
      formatTimeSemantics(document.time_semantics),
    ),
    createDetailField("source_method", document.source_method),
  ]);
}

function buildDocumentSignalFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("feed_score", document.ranking.feed_score),
    createDetailField("priority_reason", document.ranking.priority_reason),
    createDetailField("spark_score", document.discovery.spark_score),
    createDetailField("discovery_reason", document.discovery.primary_reason),
    createDetailField("importance_score", document.llm.importance_score),
    createDetailField("importance_reason", document.llm.importance_reason),
    createDetailField(
      "engagement_primary_name",
      document.engagement_primary.name,
    ),
    createDetailField(
      "engagement_primary_value",
      document.engagement_primary.value,
    ),
  ]);
}

function buildDocumentReferenceFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("reference_url", document.reference_url, {
      href: document.reference_url,
    }),
    createDetailField("canonical_url", document.canonical_url, {
      href: document.canonical_url,
    }),
    createDetailField("url", document.url, {
      href: document.url,
    }),
    createDetailField("display_url", document.reference.display_url, {
      href: document.reference.display_url,
    }),
    createDetailField("source_endpoint", document.source_endpoint, {
      href: document.source_endpoint,
    }),
  ]);
}

function buildDocumentRelatedLinkFields(document: SessionDocument) {
  return filterDetailFields(
    document.related_urls.map((url, index) =>
      createDetailField(`related_${index + 1}`, url, { href: url }),
    ),
  );
}

function buildDocumentLlmFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("status", document.llm.status),
    createDetailField("summary_1l", document.llm.summary_1l),
    createDetailField("summary_short", document.llm.summary_short),
    createDetailField(
      "primary_domain",
      formatSourceCategory(document.llm.primary_domain),
    ),
    createDetailField("importance_score", document.llm.importance_score),
    createDetailField("importance_reason", document.llm.importance_reason),
    createDetailField("model_name", document.llm.run_meta.model_name),
    createDetailField("prompt_version", document.llm.run_meta.prompt_version),
    createDetailField(
      "fewshot_pack_version",
      document.llm.run_meta.fewshot_pack_version,
    ),
    createDetailField("generated_at", document.llm.run_meta.generated_at),
  ]);
}

function buildDocumentBenchmarkFields(document: SessionDocument) {
  const benchmark = document.benchmark;
  return filterDetailFields([
    createDetailField("board_name", benchmark.board_name),
    createDetailField("kind", formatBenchmarkKind(benchmark.kind)),
    createDetailField("rank", benchmark.rank),
    createDetailField(
      "score",
      formatBenchmarkScore(
        benchmark.score_label,
        benchmark.score_value,
        benchmark.score_unit,
      ),
    ),
    createDetailField("score_label", benchmark.score_label),
    createDetailField("score_value", benchmark.score_value),
    createDetailField("score_unit", formatBenchmarkUnit(benchmark.score_unit)),
    createDetailField("votes", benchmark.votes),
    createDetailField("model_name", benchmark.model_name),
    createDetailField("organization", benchmark.organization),
    createDetailField("snapshot_at", benchmark.snapshot_at),
    createDetailField("total_models", benchmark.total_models),
    createDetailField("total_votes", benchmark.total_votes),
  ]);
}

function buildDocumentModelFields(document: SessionDocument) {
  if (!["model", "model_trending"].includes(document.doc_type)) {
    return [];
  }

  const metadata = document.metadata;
  return filterDetailFields([
    createDetailField("pipeline_tag", metadata["pipeline_tag"]),
    createDetailField("library_name", metadata["library_name"]),
    createDetailField(
      "license_tags",
      toRenderableStringArray(metadata["license_tags"]),
    ),
    createDetailField("regions", toRenderableStringArray(metadata["regions"])),
    createDetailField("arxiv_ids", toRenderableStringArray(metadata["arxiv_ids"])),
    createDetailField("private", metadata["private"]),
    createDetailField("eval_results", metadata["eval_results"]),
  ]);
}

function buildDocumentMetadataFields(document: SessionDocument) {
  return buildRecordFields(document.metadata, { maxItems: 10 });
}

function buildDocumentExternalIdFields(document: SessionDocument) {
  return buildRecordFields(document.external_ids, { maxItems: 10 });
}

function buildDocumentRawRefFields(document: SessionDocument) {
  return buildRecordFields(document.raw_ref, { maxItems: 10 });
}

function buildDocumentTagItems(document: SessionDocument) {
  return document.tags.filter((tag) => tag.trim().length > 0);
}

function buildDocumentAuthorItems(document: SessionDocument) {
  const authors =
    document.authors.length > 0
      ? document.authors
      : document.author
        ? [document.author]
        : [];

  return authors.filter((author) => author.trim().length > 0);
}

function buildDocumentEntityItems(document: SessionDocument) {
  return [...document.llm.entities, ...document.llm.subdomains].filter(
    (item) => item.trim().length > 0,
  );
}

function buildDocumentEvidenceChunkItems(document: SessionDocument) {
  return document.llm.evidence_chunk_ids.filter(
    (item) => item.trim().length > 0,
  );
}

function buildDocumentBenchmarkEntryItems(document: SessionDocument) {
  const metadata = document.metadata;
  const topEntries = toRecordArray(metadata["top_entries"]);
  const entries =
    topEntries.length > 0 ? topEntries : toRecordArray(metadata["entries"]);

  return entries.slice(0, 5).map((entry) => {
    const rank = formatDetailValue(entry["rank"]);
    const modelName = formatDetailValue(entry["model_name"]);
    const organization = formatDetailValue(entry["organization"]);
    const rating = formatLeaderboardValue(entry["rating"]);
    const votes = formatLeaderboardValue(entry["votes"]);
    const segments = [
      rank !== "-" ? `#${rank}` : null,
      modelName !== "-" ? modelName : null,
      organization !== "-" ? organization : null,
      rating !== "-" ? `rating ${rating}` : null,
      votes !== "-" ? `votes ${votes}` : null,
    ].filter((segment): segment is string => segment != null);

    return compactText(segments.join(" / "), 160);
  }).filter((item) => item.length > 0);
}

function buildPlaceholderSteps(
  activeId: string = "prepare",
): DashboardLoading["steps"] {
  const steps = [
    {
      id: "prepare",
      label: "Prepare",
      detail: "요청을 받고 source 범위와 실행 파라미터를 확정합니다.",
    },
    {
      id: "collect",
      label: "Collect",
      detail: "source_fetch가 source별 원문을 실제로 수집합니다.",
    },
    {
      id: "normalize",
      label: "Normalize",
      detail: "manifest와 normalized 산출물을 run 디렉터리에 기록합니다.",
    },
    {
      id: "publish-docs",
      label: "Publish Docs",
      detail: "displayable document를 Redis doc 키로 올립니다.",
    },
    {
      id: "publish-views",
      label: "Publish Views",
      detail: "feed, dashboard, active session view를 갱신합니다.",
    },
    {
      id: "summarize",
      label: "Summarize",
      detail: "선택된 문서를 요약해 summary field를 채웁니다.",
    },
    {
      id: "digest",
      label: "Digests",
      detail: "category digest를 생성하고 마무리 상태를 기록합니다.",
    },
  ] as const;

  return steps.map((step) => ({
    ...step,
    status: step.id === activeId ? "active" : "pending",
  }));
}

function buildInitialLoadingState(): DashboardLoading {
  return {
    stage: "connecting",
    stageLabel: "Dashboard 연결",
    detail: "backend에서 active session 상태를 확인하고 있습니다.",
    progressCurrent: 0,
    progressTotal: 0,
    percent: 0,
    currentSource: null,
    steps: buildPlaceholderSteps("prepare"),
  };
}

function buildReloadLoadingState(previous?: DashboardLoading): DashboardLoading {
  return {
    stage: "reloading",
    stageLabel: "Session Reload",
    detail:
      "새로운 run을 수집하고 Redis active session을 교체하고 있습니다.",
    progressCurrent: 0,
    progressTotal: 0,
    percent: 0,
    currentSource: previous?.currentSource ?? null,
    steps: buildPlaceholderSteps("collect").map((step) =>
      step.id === "prepare"
        ? { ...step, status: "complete" }
        : step,
    ),
  };
}

function FullscreenLoading({
  brand,
  loading,
}: {
  brand: DashboardResponse["brand"];
  loading: DashboardLoading;
}) {
  const hasMeasuredProgress = loading.progressTotal > 0;
  const progressWidth = hasMeasuredProgress
    ? `${Math.max(4, loading.percent)}%`
    : "32%";
  const processingText = loading.currentSource
    ? `현재 처리 중: ${loading.currentSource}`
    : "현재 처리 중인 source를 기다리는 중입니다.";

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-8">
      <section className="orbit-loader-shell w-full max-w-2xl">
        <p className="font-mono text-[0.64rem] uppercase tracking-[0.22em] text-orbit-accent">
          live bootstrap
        </p>
        <h1 className="orbit-wrap-anywhere mt-4 font-display text-[1.5rem] font-semibold text-orbit-text md:text-[1.9rem]">
          {brand.name}
        </h1>
        <p className="orbit-wrap-anywhere mt-3 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-orbit-accent-dim">
          {loading.stageLabel}
        </p>

        <div className="mt-6 border border-orbit-border bg-orbit-bg p-3">
          <div className="orbit-loading-bar">
            <div
              className={
                hasMeasuredProgress
                  ? "orbit-loading-bar__fill"
                  : "orbit-loading-bar__fill orbit-loading-bar__fill--indeterminate"
              }
              style={hasMeasuredProgress ? { width: progressWidth } : undefined}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-orbit-accent">
              {hasMeasuredProgress ? `${loading.percent}%` : "loading"}
            </p>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted">
              {loading.progressTotal > 0
                ? `${loading.progressCurrent}/${loading.progressTotal}`
                : "waiting"}
            </p>
          </div>
        </div>

        <p className="orbit-wrap-anywhere mt-5 text-center text-[0.82rem] leading-[1.7] text-orbit-text">
          {processingText}
        </p>

        <div className="mt-4 border border-orbit-border bg-orbit-bg px-4 py-3">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-orbit-accent">
            sse detail
          </p>
          <p className="orbit-wrap-anywhere mt-2 text-[0.76rem] leading-[1.65] text-orbit-text">
            {loading.detail}
          </p>
          {loading.currentSource ? (
            <p className="orbit-wrap-anywhere mt-2 font-mono text-[0.62rem] uppercase leading-[1.5] tracking-[0.12em] text-orbit-accent-dim">
              source / {loading.currentSource}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SettingsGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v3.1M12 17.4v3.1M20.5 12h-3.1M6.6 12H3.5M17.95 6.05l-2.2 2.2M8.25 15.75l-2.2 2.2M17.95 17.95l-2.2-2.2M8.25 8.25l-2.2-2.2" />
      <path d="M9.2 3.5h5.6M9.2 20.5h5.6M20.5 9.2v5.6M3.5 9.2v5.6" />
    </svg>
  );
}

function ConsoleHeader({
  title,
  subtitle,
  onOpenSettings,
}: {
  title: string;
  subtitle: string;
  onOpenSettings: () => void;
}) {
  return (
    <header className="relative z-10 border-b border-orbit-border-strong bg-orbit-bg-elevated">
      <div
        className={`${shell} flex items-center justify-between gap-3 px-3 py-2.5 md:px-4 md:py-3`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="block h-2 w-2 shrink-0 border border-orbit-accent bg-orbit-accent"
          />
          <div className="min-w-0">
            <p className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-orbit-accent">
              system header
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="orbit-wrap-anywhere min-w-0 font-display text-[0.9rem] font-semibold text-orbit-text">
                {title}
              </h1>
              <span className="orbit-token-ellipsis hidden max-w-[14rem] border border-orbit-border bg-orbit-panel px-1.5 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.16em] text-orbit-text sm:inline-flex">
                {subtitle}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="설정"
          title="설정"
          className="group inline-flex h-9 w-9 shrink-0 items-center justify-center border border-orbit-border-strong bg-orbit-panel font-mono text-orbit-accent transition-colors duration-150 hover:border-orbit-accent hover:bg-orbit-bg hover:text-orbit-text"
          onClick={onOpenSettings}
        >
          <SettingsGlyph />
        </button>
      </div>
    </header>
  );
}

function SettingsToggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-3 border border-orbit-border bg-orbit-bg p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
          {label}
        </p>
        <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
          {description}
        </p>
      </div>
      <button
        type="button"
        aria-pressed={enabled}
        className={[
          "inline-flex h-9 min-w-[92px] items-center justify-center border px-3 font-mono text-[0.66rem] uppercase tracking-[0.14em] transition-colors duration-150",
          enabled
            ? "border-orbit-accent bg-orbit-panel text-orbit-accent"
            : "border-orbit-border bg-orbit-bg-elevated text-orbit-muted hover:border-orbit-border-strong hover:text-orbit-text",
        ].join(" ")}
        onClick={onToggle}
      >
        {enabled ? "enabled" : "disabled"}
      </button>
    </div>
  );
}

function SettingsModal({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
  onResetWorkspace,
  onRestoreDefaults,
}: {
  isOpen: boolean;
  settings: UiSettings;
  onClose: () => void;
  onUpdateSettings: (next: UiSettings) => void;
  onResetWorkspace: () => void;
  onRestoreDefaults: () => void;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-orbit-bg/80 p-3 md:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(760px,92vh)] w-full max-w-3xl flex-col overflow-hidden border border-orbit-border-strong bg-orbit-bg-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="orbit-grid pointer-events-none absolute inset-0 opacity-20"
        />
        <div
          aria-hidden="true"
          className="orbit-scanlines pointer-events-none absolute inset-0 opacity-20"
        />

        <div className="relative z-10 border-b border-orbit-border-strong bg-orbit-bg px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-orbit-accent">
                system settings
              </p>
              <h2 className="mt-2 font-display text-[1rem] font-semibold text-orbit-text">
                Workspace Control Panel
              </h2>
              <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                표시 설정은 로컬에 저장되고, 현재 대시보드 화면에 바로
                반영됩니다.
              </p>
            </div>

            <button
              type="button"
              className="shrink-0 border border-orbit-border bg-orbit-panel px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
              onClick={onClose}
            >
              close
            </button>
          </div>
        </div>

        <div className="relative z-10 min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <section className="space-y-3 border border-orbit-border bg-orbit-bg-elevated p-3">
              <div className="border-b border-orbit-border pb-3">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Display
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  화면 분위기와 작업 밀도를 제어합니다.
                </p>
              </div>

              <SettingsToggle
                label="Motion Effects"
                description="section2 상세 카드 reveal 애니메이션과 해커톤 스타일 모션을 켜거나 끕니다."
                enabled={settings.motionEnabled}
                onToggle={() =>
                  onUpdateSettings({
                    ...settings,
                    motionEnabled: !settings.motionEnabled,
                  })
                }
              />

              <SettingsToggle
                label="Ambient Overlay"
                description="배경 grid와 scanline 오버레이를 표시합니다. 정보 밀도는 유지하고 장식만 줄일 때 유용합니다."
                enabled={settings.overlaysEnabled}
                onToggle={() =>
                  onUpdateSettings({
                    ...settings,
                    overlaysEnabled: !settings.overlaysEnabled,
                  })
                }
              />

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Panel Height
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  패널 1칸 높이를 바꿔서 요약 밀도와 드래그 손맛을 조정합니다.
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {ROW_HEIGHT_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={[
                        "border px-3 py-3 text-left transition-colors duration-150",
                        settings.rowHeightMode === option.id
                          ? "border-orbit-accent bg-orbit-panel"
                          : "border-orbit-border bg-orbit-bg-elevated hover:border-orbit-border-strong",
                      ].join(" ")}
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          rowHeightMode: option.id,
                        })
                      }
                    >
                      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                        {option.label}
                      </p>
                      <p className="mt-2 font-display text-[0.82rem] font-semibold text-orbit-text">
                        {option.note}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3 border border-orbit-border bg-orbit-bg-elevated p-3">
              <div className="border-b border-orbit-border pb-3">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Workspace Tools
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  레이아웃 저장 상태를 정리하거나 추천 기본값으로 되돌립니다.
                </p>
              </div>

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Layout Reset
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  패널 드래그 순서, 가로/세로 span 저장값을 지우고 현재 추천
                  배치로 다시 시작합니다.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex border border-orbit-border-strong bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                  onClick={onResetWorkspace}
                >
                  reset panel layout
                </button>
              </div>

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Recommended Default
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  모션 on, 배경 오버레이 on, panel height standard 설정으로
                  되돌리고 저장된 레이아웃도 초기화합니다.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg"
                  onClick={onRestoreDefaults}
                >
                  restore defaults
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailFieldGrid({
  label,
  fields,
}: {
  label: string;
  fields: readonly DetailField[];
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {fields.map((field) => (
          <article
            key={`${label}-${field.label}-${field.value}`}
            className="border border-orbit-border bg-orbit-bg p-3"
          >
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-orbit-accent-dim">
              {field.label}
            </p>
            {field.href ? (
              <a
                href={field.href}
                target="_blank"
                rel="noreferrer"
                className="orbit-wrap-anywhere mt-2 block text-[0.74rem] leading-[1.55] text-orbit-text underline underline-offset-4 transition-colors duration-150 hover:text-orbit-accent"
              >
                {field.value}
              </a>
            ) : (
              <p className="orbit-wrap-anywhere mt-2 text-[0.74rem] leading-[1.55] text-orbit-text">
                {field.value}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailChipBlock({
  label,
  items,
}: {
  label: string;
  items: readonly string[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={`${label}-${item}`}
            className="orbit-chip-wrap max-w-full border border-orbit-border bg-orbit-bg px-3 py-2 text-[0.72rem] leading-[1.45] text-orbit-text"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function DetailTextBlock({
  label,
  text,
}: {
  label: string;
  text: string | null | undefined;
}) {
  if (!text) {
    return null;
  }

  return (
    <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <div className="mt-3 border border-orbit-border bg-orbit-bg px-3 py-3">
        <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.7] text-orbit-text">
          {text}
        </p>
      </div>
    </section>
  );
}

function HackerRevealCard({
  delayMs = 0,
  children,
}: {
  delayMs?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="orbit-hacker-reveal"
      style={{ "--hacker-delay": `${delayMs}ms` } as CSSProperties}
    >
      <div className="orbit-hacker-reveal__content">{children}</div>
    </div>
  );
}

function buildDigestDetailPanel(
  payload: DigestDetailResponse,
  onClose: () => void,
  onOpenDocument: (documentId: string, referenceUrl: string) => void,
) {
  const digestFields = filterDetailFields([
    createDetailField("session_id", payload.sessionId),
    createDetailField("status", payload.status),
    createDetailField("domain", payload.digest.domain),
    createDetailField("evidence", payload.digest.evidence),
    createDetailField("updated_at", payload.digest.updatedAt),
  ]);

  return {
    title: `${payload.digest.domain} Detail`,
    node: (
      <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
        <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
          <div className="flex min-h-full flex-col gap-2">
            <HackerRevealCard delayMs={0}>
              <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                      {payload.status}
                    </p>
                    <h3 className="orbit-wrap-anywhere mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                      {payload.digest.headline}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 border border-orbit-border-strong bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                    onClick={onClose}
                  >
                    기본 정보 패널
                  </button>
                </div>
              </section>
            </HackerRevealCard>

            <HackerRevealCard delayMs={90}>
              <DetailTextBlock label="summary" text={payload.digest.summary} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={140}>
              <DetailFieldGrid
                label="Digest Context"
                fields={digestFields}
              />
            </HackerRevealCard>

            <HackerRevealCard delayMs={200}>
              <DetailChipBlock label="Document IDs" items={payload.digest.documentIds} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={260}>
              <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                  Linked Documents
                </p>
                <div className="mt-3 grid gap-2">
                  {payload.documents.map((document) => (
                    <button
                      key={document.document_id}
                      type="button"
                      className="border border-orbit-border bg-orbit-bg px-3 py-3 text-left transition-colors duration-150 hover:border-orbit-accent"
                      onClick={() =>
                        onOpenDocument(
                          document.document_id,
                          document.reference_url ||
                            document.canonical_url ||
                            document.url ||
                            "",
                        )
                      }
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.8rem] font-semibold text-orbit-text">
                          {document.title}
                        </p>
                        <span className="orbit-token-ellipsis inline-flex max-w-[10rem] border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-text">
                          {document.llm.status}
                        </span>
                      </div>
                      <p className="orbit-wrap-anywhere mt-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                        {document.source} / {formatDocType(document.doc_type)}
                      </p>
                      {document.llm.summary_short ? (
                        <p className="orbit-wrap-anywhere mt-2 text-[0.72rem] leading-[1.55] text-orbit-text">
                          {document.llm.summary_short}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            </HackerRevealCard>
          </div>
        </div>
      </div>
    ),
  };
}

function buildDocumentDetailPanel(
  document: SessionDocument,
  onClose: () => void,
) {
  const referenceUrl =
    document.reference_url || document.canonical_url || document.url;
  const identityFields = buildDocumentIdentityFields(document);
  const timeFields = buildDocumentTimeFields(document);
  const signalFields = buildDocumentSignalFields(document);
  const referenceFields = buildDocumentReferenceFields(document);
  const relatedFields = buildDocumentRelatedLinkFields(document);
  const llmFields = buildDocumentLlmFields(document);
  const benchmarkFields = buildDocumentBenchmarkFields(document);
  const modelFields = buildDocumentModelFields(document);
  const metadataFields = buildDocumentMetadataFields(document);
  const externalIdFields = buildDocumentExternalIdFields(document);
  const rawRefFields = buildDocumentRawRefFields(document);
  const authorItems = buildDocumentAuthorItems(document);
  const tagItems = buildDocumentTagItems(document);
  const entityItems = buildDocumentEntityItems(document);
  const evidenceChunkItems = buildDocumentEvidenceChunkItems(document);
  const benchmarkEntryItems = buildDocumentBenchmarkEntryItems(document);

  return {
    title: `${document.source} Document`,
    node: (
      <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
        <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
          <div className="flex min-h-full flex-col gap-2">
            <HackerRevealCard delayMs={0}>
              <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                      {document.llm.status}
                    </p>
                    <h3 className="orbit-wrap-anywhere mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                      {document.title}
                    </h3>
                    <p className="orbit-wrap-anywhere mt-2 text-[0.72rem] leading-[1.55] text-orbit-text">
                      {document.source} / {formatDocType(document.doc_type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="border border-orbit-border bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                      onClick={() =>
                        referenceUrl &&
                        window.open(referenceUrl, "_blank", "noopener,noreferrer")
                      }
                    >
                      open source
                    </button>
                    <button
                      type="button"
                      className="border border-orbit-border-strong bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                      onClick={onClose}
                    >
                      기본 정보 패널
                    </button>
                  </div>
                </div>
              </section>
            </HackerRevealCard>

            <HackerRevealCard delayMs={90}>
              <DetailTextBlock label="description" text={document.description} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={140}>
              <DetailFieldGrid label="Identity" fields={identityFields} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={200}>
              <DetailFieldGrid label="Timing" fields={timeFields} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={260}>
              <DetailFieldGrid label="Signals" fields={signalFields} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={320}>
              <DetailChipBlock label="Authors" items={authorItems} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={380}>
              <DetailChipBlock label="Tags" items={tagItems} />
            </HackerRevealCard>

            <HackerRevealCard delayMs={440}>
              <DetailChipBlock label="Entities / Subdomains" items={entityItems} />
            </HackerRevealCard>

            {evidenceChunkItems.length > 0 ? (
              <HackerRevealCard delayMs={500}>
                <DetailChipBlock
                  label="Evidence Chunk IDs"
                  items={evidenceChunkItems}
                />
              </HackerRevealCard>
            ) : null}

            <HackerRevealCard delayMs={560}>
              <DetailFieldGrid label="Source Links" fields={referenceFields} />
            </HackerRevealCard>

            {relatedFields.length > 0 ? (
              <HackerRevealCard delayMs={620}>
                <DetailFieldGrid label="Related URLs" fields={relatedFields} />
              </HackerRevealCard>
            ) : null}

            <HackerRevealCard delayMs={680}>
              <DetailFieldGrid label="LLM / Summary Block" fields={llmFields} />
            </HackerRevealCard>

            {benchmarkFields.length > 0 ? (
              <HackerRevealCard delayMs={740}>
                <DetailFieldGrid label="Benchmark" fields={benchmarkFields} />
              </HackerRevealCard>
            ) : null}

            {benchmarkEntryItems.length > 0 ? (
              <HackerRevealCard delayMs={780}>
                <DetailChipBlock
                  label="Leaderboard Entries"
                  items={benchmarkEntryItems}
                />
              </HackerRevealCard>
            ) : null}

            {modelFields.length > 0 ? (
              <HackerRevealCard delayMs={820}>
                <DetailFieldGrid label="Model Snapshot" fields={modelFields} />
              </HackerRevealCard>
            ) : null}

            {metadataFields.length > 0 ? (
              <HackerRevealCard delayMs={860}>
                <DetailFieldGrid label="Metadata" fields={metadataFields} />
              </HackerRevealCard>
            ) : null}

            {externalIdFields.length > 0 ? (
              <HackerRevealCard delayMs={920}>
                <DetailFieldGrid label="External IDs" fields={externalIdFields} />
              </HackerRevealCard>
            ) : null}

            {rawRefFields.length > 0 ? (
              <HackerRevealCard delayMs={980}>
                <DetailFieldGrid label="Raw Trace" fields={rawRefFields} />
              </HackerRevealCard>
            ) : null}

            <HackerRevealCard delayMs={1040}>
              <DetailTextBlock
                label="reference.snippet"
                text={document.reference.snippet}
              />
            </HackerRevealCard>

            <HackerRevealCard delayMs={1100}>
              <DetailTextBlock
                label="summary_input_text"
                text={document.summary_input_text}
              />
            </HackerRevealCard>

            <HackerRevealCard delayMs={1160}>
              <DetailTextBlock label="body_text" text={document.body_text} />
            </HackerRevealCard>
          </div>
        </div>
      </div>
    ),
  };
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse>(EMPTY_DASHBOARD);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>(null);
  const [selectedDigestId, setSelectedDigestId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [uiSettings, setUiSettings] = useState<UiSettings>(loadUiSettings);
  const [blockingLoadingState, setBlockingLoadingState] =
    useState<DashboardLoading | null>(null);
  const [leaderboardOverview, setLeaderboardOverview] =
    useState<SessionArenaOverview | null>(null);
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [selectedLeaderboardId, setSelectedLeaderboardId] =
    useState<string | null>(null);

  const rowHeightPx =
    ROW_HEIGHT_MODE_OPTIONS.find(
      (option) => option.id === uiSettings.rowHeightMode,
    )?.rowHeightPx ?? 320;

  async function loadDashboardData(session = "active") {
    try {
      const payload = await fetchDashboard(session);
      setDashboard(payload);
      setDashboardError(null);
      return payload;
    } catch (error) {
      setDashboard((current) =>
        current.session.sessionId === EMPTY_DASHBOARD.session.sessionId
          ? EMPTY_DASHBOARD
          : current,
      );
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "BFF API에 연결하지 못했습니다.",
      );
      return EMPTY_DASHBOARD;
    } finally {
      setIsLoadingDashboard(false);
    }
  }

  useEffect(() => {
    let isDisposed = false;
    let dashboardStream: EventSource | null = null;

    async function resumeReloadIfNeeded() {
      try {
        const payload = await fetchReloadState();
        if (isDisposed) {
          return;
        }
        if (
          payload.status === "collecting" ||
          payload.status === "published" ||
          payload.status === "summarizing"
        ) {
          setBlockingLoadingState(
            payload.loading ?? buildReloadLoadingState(),
          );
          setIsReloading(true);
        }
      } catch {
        // dashboard stream fallback covers the initial load path.
      }
    }

    async function initializeDashboardStream() {
      await resumeReloadIfNeeded();
      if (isDisposed) {
        return;
      }

      if (typeof EventSource === "undefined") {
        await loadDashboardData();
        return;
      }

      let hasReceivedMessage = false;
      dashboardStream = openDashboardStream("active");

      dashboardStream.onmessage = (event) => {
        if (isDisposed) {
          return;
        }
        try {
          const payload = JSON.parse(event.data) as DashboardResponse;
          hasReceivedMessage = true;
          setDashboard(payload);
          setDashboardError(null);
        } catch (error) {
          setDashboardError(
            error instanceof Error
              ? compactText(error.message, 180)
              : "dashboard stream payload를 해석하지 못했습니다.",
          );
        } finally {
          setIsLoadingDashboard(false);
        }
      };

      dashboardStream.onerror = () => {
        if (isDisposed || hasReceivedMessage) {
          return;
        }
        void loadDashboardData();
      };
    }

    void initializeDashboardStream();

    return () => {
      isDisposed = true;
      dashboardStream?.close();
    };
  }, []);

  useEffect(() => {
    if (!isReloading) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isReloading]);

  useEffect(() => {
    if (!isReloading) {
      return;
    }

    if (typeof EventSource === "undefined") {
      return;
    }

    let isDisposed = false;
    let isTerminal = false;
    const reloadStream = openReloadStream();

    reloadStream.onmessage = (event) => {
      if (isDisposed) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as SessionReloadStateResponse;
        if (payload.loading) {
          setBlockingLoadingState(payload.loading);
        }

        if (payload.status === "ready" || payload.status === "partial_error") {
          isTerminal = true;
          setDashboardError(null);
          setBlockingLoadingState(null);
          setIsReloading(false);
          reloadStream.close();
          return;
        }

        if (payload.status === "error") {
          isTerminal = true;
          setDashboardError(
            compactText(
              payload.error ?? "reload 처리 중 오류가 발생했습니다.",
              180,
            ),
          );
          setBlockingLoadingState(null);
          setIsReloading(false);
          reloadStream.close();
        }
      } catch (error) {
        setDashboardError(
          error instanceof Error
            ? compactText(error.message, 180)
            : "reload stream payload를 해석하지 못했습니다.",
        );
        setBlockingLoadingState(null);
        setIsReloading(false);
        reloadStream.close();
      }
    };

    reloadStream.onerror = () => {
      if (isDisposed || isTerminal) {
        return;
      }
      setDashboardError("reload stream 연결이 끊어졌습니다.");
      setBlockingLoadingState(null);
      setIsReloading(false);
      reloadStream.close();
    };

    return () => {
      isDisposed = true;
      reloadStream.close();
    };
  }, [isReloading]);

  useEffect(() => {
    window.localStorage.setItem(
      UI_SETTINGS_STORAGE_KEY,
      JSON.stringify(uiSettings),
    );
  }, [uiSettings]);

  useEffect(() => {
    const sessionId = dashboard.session.sessionId;
    if (
      sessionId === EMPTY_DASHBOARD.session.sessionId ||
      dashboard.status === "collecting"
    ) {
      setLeaderboardOverview(null);
      setLeaderboardError(null);
      setIsLoadingLeaderboards(false);
      return;
    }

    let isDisposed = false;

    async function loadLeaderboards() {
      setIsLoadingLeaderboards(true);
      setLeaderboardError(null);
      try {
        const payload = await fetchLeaderboards(sessionId);
        if (isDisposed) {
          return;
        }
        setLeaderboardOverview(payload.leaderboard);
      } catch (error) {
        if (isDisposed) {
          return;
        }
        setLeaderboardOverview(null);
        setLeaderboardError(
          error instanceof Error
            ? compactText(error.message, 180)
            : "leaderboard API를 불러오지 못했습니다.",
        );
      } finally {
        if (!isDisposed) {
          setIsLoadingLeaderboards(false);
        }
      }
    }

    void loadLeaderboards();

    return () => {
      isDisposed = true;
    };
  }, [dashboard.session.sessionId, dashboard.status]);

  function resetWorkspaceLayout() {
    resetPanelWorkspaceStorage();
    setDetailState(null);
    setSelectedDigestId(null);
    setSelectedDocumentId(null);
    setWorkspaceVersion((current) => current + 1);
  }

  function restoreDefaultSettings() {
    setUiSettings({ ...DEFAULT_UI_SETTINGS });
    resetWorkspaceLayout();
    setIsSettingsOpen(false);
  }

  async function handleSelectDigest(digest: DigestItem) {
    setSelectedDigestId(digest.id);
    setSelectedDocumentId(null);

    try {
      const payload = await fetchDigestDetail(digest.id);
      setDetailState({ kind: "digest", payload });
      setDashboardError(null);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "digest detail을 불러오지 못했습니다.",
      );
    }
  }

  async function handleSelectDocument(
    documentId: string,
    referenceUrl: string,
  ) {
    setSelectedDocumentId(documentId);
    setSelectedDigestId(null);

    if (referenceUrl) {
      window.open(referenceUrl, "_blank", "noopener,noreferrer");
    }

    try {
      const payload = await fetchDocument(documentId);
      setDetailState({ kind: "document", payload });
      setDashboardError(null);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "document detail을 불러오지 못했습니다.",
      );
    }
  }

  async function handleReloadSession() {
    setIsReloading(true);
    setBlockingLoadingState(
      buildReloadLoadingState(dashboard.session.loading ?? undefined),
    );
    setDashboardError(null);
    setDetailState(null);
    setSelectedDigestId(null);
    setSelectedDocumentId(null);
    try {
      const result = await reloadSession({
        profile: "full",
        run_label: "redis-session",
      });
      setBlockingLoadingState(
        result.loading ??
          buildReloadLoadingState(dashboard.session.loading ?? undefined),
      );
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "reload 요청에 실패했습니다.",
      );
      setBlockingLoadingState(null);
      setIsReloading(false);
    }
  }

  const sessionLabel = `${dashboard.session.sessionDate} / ${dashboard.session.window}`;
  const panelSessionLabel = buildPanelSessionLabel(
    dashboard.session.sessionDate,
    dashboard.session.window,
  );
  const fullscreenLoadingState =
    dashboard.status === "collecting"
      ? dashboard.session.loading ?? buildInitialLoadingState()
      : blockingLoadingState
        ? blockingLoadingState
      : isLoadingDashboard
        ? buildInitialLoadingState()
        : null;
  const shouldShowFullscreenLoading =
    isLoadingDashboard ||
    blockingLoadingState !== null ||
    dashboard.status === "collecting";
  const resolvedArenaOverview =
    leaderboardOverview ?? dashboard.session.arenaOverview;
  const arenaBoards = resolvedArenaOverview?.boards ?? EMPTY_ARENA_BOARDS;
  const arenaBoardIdsKey = arenaBoards.map((board) => board.id).join("::");
  const selectedArenaBoard =
    arenaBoards.find((board) => board.id === selectedLeaderboardId) ??
    arenaBoards[0] ??
    null;
  const leaderboardEntries = buildLeaderboardEntries(selectedArenaBoard);
  useEffect(() => {
    if (arenaBoards.length === 0) {
      if (selectedLeaderboardId !== null) {
        setSelectedLeaderboardId(null);
      }
      return;
    }

    if (
      selectedLeaderboardId &&
      arenaBoards.some((board) => board.id === selectedLeaderboardId)
    ) {
      return;
    }

    setSelectedLeaderboardId(arenaBoards[0].id);
  }, [arenaBoardIdsKey, selectedLeaderboardId, arenaBoards]);

  const infoItems = dashboard.feeds.map((feed) => ({
      id: feed.id,
      node: (
        <SourcePanel
          panelData={feed}
          sessionLabel={panelSessionLabel}
          selectedDocumentId={selectedDocumentId}
          onSelectItem={handleSelectDocument}
        />
      ),
      defaultRowSpan: 1,
      defaultColSpan: 1,
    }));

  const summaryPanel = (
    <SummaryPanel
      title={dashboard.summary.title}
      digests={dashboard.summary.digests}
      sessionLabel={panelSessionLabel}
      selectedDigestId={selectedDigestId}
      onSelectDigest={handleSelectDigest}
    />
  );

  const infoPanelOverride =
    detailState?.kind === "digest"
      ? buildDigestDetailPanel(
          detailState.payload,
          () => {
            setDetailState(null);
            setSelectedDigestId(null);
          },
          handleSelectDocument,
        )
      : detailState?.kind === "document"
        ? buildDocumentDetailPanel(detailState.payload, () => {
            setDetailState(null);
            setSelectedDocumentId(null);
          })
        : undefined;

  const mainPanel = (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
            Section 01
          </p>
          <h1 className="orbit-wrap-anywhere mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.32rem]">
            {dashboard.brand.name} Main Panel
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="orbit-token-ellipsis inline-flex max-w-[16rem] border border-orbit-border-strong bg-orbit-bg px-2 py-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-orbit-text">
            {sessionLabel}
          </span>
          <button
            type="button"
            className="border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isReloading}
            onClick={() => void handleReloadSession()}
          >
            {isReloading ? "reloading" : "reload session"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col border border-orbit-border bg-orbit-bg p-4">
        <div className="border-b border-orbit-border pb-3">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
            Leaderboard Workspace
          </p>
          <h2 className="orbit-wrap-anywhere mt-2 font-display text-[1rem] font-semibold text-orbit-text md:text-[1.16rem]">
            {selectedArenaBoard?.boardName ??
              resolvedArenaOverview?.title ??
              "Type Leaderboards"}
          </h2>
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto border border-orbit-border bg-orbit-panel p-1">
          {arenaBoards.map((board) => {
            const isSelected = selectedArenaBoard?.id === board.id;
            return (
              <button
                key={board.id}
                type="button"
                className={[
                  "shrink-0 border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] transition-colors duration-150",
                  isSelected
                    ? "border-orbit-accent bg-orbit-bg text-orbit-accent"
                    : "border-transparent bg-transparent text-orbit-muted hover:border-orbit-border hover:text-orbit-text",
                ].join(" ")}
                onClick={() => setSelectedLeaderboardId(board.id)}
              >
                {board.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoadingLeaderboards ? (
            <div className="border border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.6] text-orbit-text">
                leaderboard API를 불러오는 중입니다.
              </p>
            </div>
          ) : leaderboardError ? (
            <div className="border border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.6] text-orbit-text">
                {leaderboardError}
              </p>
            </div>
          ) : dashboardError ? (
            <div className="border border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.6] text-orbit-text">
                {dashboardError}
              </p>
            </div>
          ) : selectedArenaBoard ? (
            <div className="grid gap-2">
              {leaderboardEntries.map((entry, index) => (
                <HackerRevealCard
                  key={`${selectedArenaBoard.id}-${entry.rank}-${entry.modelName}`}
                  delayMs={index * 70}
                >
                  <article className="orbit-leaderboard-entry grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 p-3">
                    <div className="orbit-leaderboard-entry__rank flex h-10 min-w-10 items-center justify-center px-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-orbit-accent">
                      #{entry.rank ?? "-"}
                    </div>
                    <div className="orbit-leaderboard-entry__body min-w-0">
                      {entry.url ? (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="orbit-wrap-anywhere font-display text-[0.9rem] font-semibold leading-[1.45] text-orbit-text underline underline-offset-4 hover:text-orbit-accent"
                        >
                          {entry.modelName ?? "-"}
                        </a>
                      ) : (
                        <h3 className="orbit-wrap-anywhere font-display text-[0.9rem] font-semibold leading-[1.45] text-orbit-text">
                          {entry.modelName ?? "-"}
                        </h3>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.organization ? (
                          <span className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-text">
                            {entry.organization}
                          </span>
                        ) : null}
                        {entry.rating != null ? (
                          <span className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-text">
                            {selectedArenaBoard.scoreLabel
                              ? `${selectedArenaBoard.scoreLabel} ${formatLeaderboardValue(entry.rating)}`
                              : formatLeaderboardValue(entry.rating)}
                          </span>
                        ) : null}
                        {entry.votes != null ? (
                          <span className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-text">
                            votes {formatLeaderboardValue(entry.votes)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </HackerRevealCard>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.74rem] leading-[1.6] text-orbit-muted">
                메인 패널에 표시할 leaderboard 데이터가 아직 없습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  if (shouldShowFullscreenLoading && fullscreenLoadingState) {
    return (
      <div
        data-orbit-motion={uiSettings.motionEnabled ? "on" : "off"}
        className="relative flex h-dvh w-screen flex-col overflow-hidden bg-orbit-bg font-body text-orbit-text"
      >
        {uiSettings.overlaysEnabled ? (
          <>
            <div
              aria-hidden="true"
              className="orbit-grid pointer-events-none fixed inset-0 -z-20 opacity-70"
            />
            <div
              aria-hidden="true"
              className="orbit-scanlines pointer-events-none fixed inset-0 -z-10 opacity-45"
            />
          </>
        ) : null}

        <FullscreenLoading
          brand={dashboard.brand}
          loading={fullscreenLoadingState}
        />
      </div>
    );
  }

  return (
    <div
      data-orbit-motion={uiSettings.motionEnabled ? "on" : "off"}
      className="relative flex h-dvh w-screen flex-col overflow-hidden bg-orbit-bg font-body text-orbit-text"
    >
      {uiSettings.overlaysEnabled ? (
        <>
          <div
            aria-hidden="true"
            className="orbit-grid pointer-events-none fixed inset-0 -z-20 opacity-70"
          />
          <div
            aria-hidden="true"
            className="orbit-scanlines pointer-events-none fixed inset-0 -z-10 opacity-45"
          />
        </>
      ) : null}

      <ConsoleHeader
        title={dashboard.brand.name}
        subtitle={dashboard.brand.tagline}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className={`${shell} min-h-0 flex-1 overflow-hidden`}>
        <PanelWorkspace
          key={`workspace-${workspaceVersion}`}
          mainPanel={mainPanel}
          infoPanelOverride={infoPanelOverride}
          summaryPanel={summaryPanel}
          infoItems={infoItems}
          rowHeightPx={rowHeightPx}
        />
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={uiSettings}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={setUiSettings}
        onResetWorkspace={resetWorkspaceLayout}
        onRestoreDefaults={restoreDefaultSettings}
      />
    </div>
  );
}

export default App;
