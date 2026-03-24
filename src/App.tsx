import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useState,
} from "react";

import {
  PanelWorkspace,
  resetPanelWorkspaceStorage,
} from "./components/dashboard/PanelWorkspace";
import { SessionPanel } from "./components/dashboard/SessionPanel";
import { SourcePanel } from "./components/dashboard/SourcePanel";
import { SummaryPanel } from "./components/dashboard/SummaryPanel";
import { shell } from "./components/dashboard/styles";
import type { DigestItem } from "./content/dashboardContent";
import {
  fetchDashboard,
  fetchDigestDetail,
  fetchDocument,
  fetchReloadState,
  openDashboardStream,
  openReloadStream,
  reloadSession,
} from "./lib/dashboardApi";
import type {
  DashboardLoading,
  DashboardResponse,
  DigestDetailResponse,
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
        role: "백엔드가 PoC/source_fetch collection을 실행합니다.",
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

function formatIsoDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function buildDocumentSignalWindow(document: SessionDocument) {
  return [
    formatIsoDate(document.published_at ?? document.updated_at ?? document.sort_at),
    document.source_method,
    document.time_semantics,
  ].join(" · ");
}

function buildDocumentCoreFields(document: SessionDocument) {
  return [
    `source: ${document.source}`,
    `source_category: ${document.source_category}`,
    `doc_type: ${document.doc_type}`,
    `time_semantics: ${document.time_semantics}`,
    `published_at: ${document.published_at ?? "-"}`,
    `updated_at: ${document.updated_at ?? "-"}`,
  ];
}

function buildDocumentReferenceFields(document: SessionDocument) {
  return [
    `url: ${document.url || "-"}`,
    `canonical_url: ${document.canonical_url || "-"}`,
    `reference_url: ${document.reference_url || "-"}`,
    `source_endpoint: ${document.source_endpoint || "-"}`,
  ];
}

function buildDocumentMetadataFields(document: SessionDocument) {
  const entries = Object.entries(document.metadata)
    .filter(([, value]) => {
      return (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        Array.isArray(value)
      );
    })
    .slice(0, 6)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.slice(0, 4).join(", ") || "-"}`;
      }

      return `${key}: ${String(value)}`;
    });

  if (entries.length > 0) {
    return entries;
  }

  return document.tags.slice(0, 6).map((tag) => `tag: ${tag}`);
}

function buildDocumentConfidence(document: SessionDocument) {
  const signals = [
    toNumber(document.ranking.feed_score),
    toNumber(document.discovery.spark_score),
    toNumber(document.llm.importance_score),
    document.reference.display_url ? 1 : null,
  ].filter((value) => value != null).length;

  if (signals >= 4) return "high";
  if (signals >= 3) return "medium";
  return "low";
}

function buildDocumentSummary(document: SessionDocument) {
  return (
    document.llm.summary_short ||
    document.description ||
    document.reference.snippet ||
    document.summary_input_text ||
    document.body_text ||
    "요약 텍스트가 아직 준비되지 않았습니다."
  );
}

function statusLabel(status: DashboardResponse["status"]) {
  if (status === "ready") return "ready";
  if (status === "partial_error") return "partial-error";
  if (status === "summarizing") return "summarizing";
  if (status === "published") return "published";
  if (status === "collecting") return "collecting";
  return "error";
}

function statusDescription(status: DashboardResponse["status"]) {
  if (status === "ready") {
    return "feed와 digest가 모두 준비된 상태입니다.";
  }
  if (status === "partial_error") {
    return "일부 요약은 실패했지만 session과 drill-down은 계속 사용할 수 있습니다.";
  }
  if (status === "summarizing") {
    return "feed는 바로 보이고 digest와 일부 document summary가 계속 채워지고 있습니다.";
  }
  if (status === "published") {
    return "run publish는 끝났고, Redis feed/doc/dashboard가 준비된 상태입니다.";
  }
  if (status === "collecting") {
    return "새 session run을 수집 중입니다.";
  }
  return "세션 처리 중 오류가 발생했습니다.";
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
    : loading.detail;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-8">
      <section className="orbit-loader-shell w-full max-w-2xl">
        <p className="font-mono text-[0.64rem] uppercase tracking-[0.22em] text-orbit-accent">
          live bootstrap
        </p>
        <h1 className="mt-4 font-display text-[1.5rem] font-semibold text-orbit-text md:text-[1.9rem]">
          {brand.name}
        </h1>
        <p className="mt-3 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-orbit-accent-dim">
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

        <p className="mt-5 text-center text-[0.82rem] leading-[1.7] text-orbit-text">
          {processingText}
        </p>
        <p className="mt-2 text-center text-[0.74rem] leading-[1.6] text-orbit-muted">
          {loading.currentSource ? loading.detail : "데이터를 받는 동안 전체화면 로딩 상태를 유지합니다."}
        </p>
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
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate font-display text-[0.9rem] font-semibold text-orbit-text">
                {title}
              </h1>
              <span className="hidden border border-orbit-border bg-orbit-panel px-1.5 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.16em] text-orbit-muted sm:inline-flex">
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

function DetailMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <p className="mt-2 font-mono text-[0.92rem] uppercase tracking-[0.12em] text-orbit-text">
        {value}
      </p>
      <p className="mt-2 text-[0.72rem] leading-[1.55] text-orbit-muted">
        {note}
      </p>
    </article>
  );
}

function DetailListBlock({
  label,
  items,
}: {
  label: string;
  items: readonly string[];
}) {
  return (
    <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p
            key={item}
            className="border border-orbit-border bg-orbit-bg px-3 py-2 text-[0.74rem] leading-[1.6] text-orbit-muted"
          >
            {item}
          </p>
        ))}
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
  const focusItems = payload.documents.map(
    (document) =>
      `${document.source} / ${document.doc_type} / ${compactText(buildDocumentSummary(document), 120)}`,
  );

  return {
    title: `${payload.digest.domain} Detail`,
    node: (
      <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
        <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
          <div className="flex min-h-full flex-col gap-2">
            <HackerRevealCard delayMs={0}>
              <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
                <div className="flex items-start justify-between gap-3 border-b border-orbit-border pb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                      {payload.status}
                    </p>
                    <h3 className="mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
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

                <p className="mt-3 text-[0.78rem] leading-[1.7] text-orbit-muted">
                  {payload.digest.summary}
                </p>
              </section>
            </HackerRevealCard>

            <div className="grid gap-2 md:grid-cols-2">
              <HackerRevealCard delayMs={90}>
                <DetailMetric
                  label="Evidence"
                  value={payload.digest.evidence}
                  note="현재 digest가 참조한 문서 수와 대표 문서 타입을 표시합니다."
                />
              </HackerRevealCard>
              <HackerRevealCard delayMs={140}>
                <DetailMetric
                  label="Updated"
                  value={formatIsoDate(payload.digest.updatedAt)}
                  note="digest가 마지막으로 materialize된 시점입니다."
                />
              </HackerRevealCard>
            </div>

            <HackerRevealCard delayMs={200}>
              <DetailListBlock label="Focus Documents" items={focusItems} />
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
                      <p className="font-display text-[0.8rem] font-semibold text-orbit-text">
                        {document.title}
                      </p>
                      <p className="mt-2 text-[0.72rem] leading-[1.55] text-orbit-muted">
                        {compactText(buildDocumentSummary(document), 150)}
                      </p>
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

  return {
    title: `${document.source} Document`,
    node: (
      <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
        <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
          <div className="flex min-h-full flex-col gap-2">
            <HackerRevealCard delayMs={0}>
              <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
                <div className="flex items-start justify-between gap-3 border-b border-orbit-border pb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                      {document.llm.status}
                    </p>
                    <h3 className="mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                      {document.title}
                    </h3>
                    <p className="mt-2 text-[0.72rem] leading-[1.55] text-orbit-muted">
                      {document.source} / {document.doc_type}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="border border-orbit-border bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                      onClick={() => referenceUrl && window.open(referenceUrl, "_blank", "noopener,noreferrer")}
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

                <p className="mt-3 text-[0.78rem] leading-[1.7] text-orbit-muted">
                  {buildDocumentSummary(document)}
                </p>
              </section>
            </HackerRevealCard>

            <div className="grid gap-2 md:grid-cols-2">
              <HackerRevealCard delayMs={90}>
                <DetailMetric
                  label="Signal Window"
                  value={buildDocumentSignalWindow(document)}
                  note="정렬과 요약 판단에 사용된 시간/수집 메타데이터입니다."
                />
              </HackerRevealCard>
              <HackerRevealCard delayMs={140}>
                <DetailMetric
                  label="Confidence"
                  value={buildDocumentConfidence(document)}
                  note="현재 노출 신호와 reference 가용성 기준의 간단한 confidence입니다."
                />
              </HackerRevealCard>
            </div>

            <HackerRevealCard delayMs={200}>
              <DetailListBlock
                label="Core Fields"
                items={buildDocumentCoreFields(document)}
              />
            </HackerRevealCard>
            <HackerRevealCard delayMs={260}>
              <DetailListBlock
                label="Reference Fields"
                items={buildDocumentReferenceFields(document)}
              />
            </HackerRevealCard>
            <HackerRevealCard delayMs={320}>
              <DetailListBlock
                label="Metadata / Tags"
                items={buildDocumentMetadataFields(document)}
              />
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
            payload.loading ??
              buildReloadLoadingState(dashboard.session.loading ?? undefined),
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
  const topFeedItems = dashboard.feeds
    .flatMap((feed) =>
      feed.items.map((item) => ({
        ...item,
        panelTitle: feed.title,
      })),
    )
    .slice(0, 4);

  const infoItems = [
    {
      id: "session",
      node: (
        <SessionPanel
          title={dashboard.session.title}
          sessionId={dashboard.session.sessionId}
          sessionDate={dashboard.session.sessionDate}
          window={dashboard.session.window}
          reloadRule={dashboard.session.reloadRule}
          metrics={dashboard.session.metrics}
          runtime={dashboard.session.runtime}
          rules={dashboard.session.rules}
          loading={dashboard.session.loading}
        />
      ),
      defaultRowSpan: 1,
      defaultColSpan: 1,
    },
    ...dashboard.feeds.map((feed) => ({
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
    })),
  ];

  const summaryPanel = (
    <SummaryPanel
      title={dashboard.summary.title}
      headline={dashboard.summary.headline}
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
      <div className="flex items-start justify-between gap-3 border-b border-orbit-border pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
            Section 01
          </p>
          <h1 className="mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.32rem]">
            {dashboard.brand.name} Main Panel
          </h1>
          <p className="mt-2 text-[0.76rem] leading-[1.6] text-orbit-muted">
            {statusDescription(dashboard.status)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="border border-orbit-border-strong bg-orbit-bg px-2 py-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-orbit-text">
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

      <div className="mt-4 grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <div className="flex min-h-0 flex-col border border-orbit-border bg-orbit-bg p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <article className="border border-orbit-border bg-orbit-panel p-3">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                stage
              </p>
              <p className="mt-2 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-orbit-text">
                {dashboard.session.loading?.stageLabel ?? "idle"}
              </p>
            </article>
            <article className="border border-orbit-border bg-orbit-panel p-3">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                status
              </p>
              <p className="mt-2 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-orbit-text">
                {statusLabel(dashboard.status)}
              </p>
            </article>
            <article className="border border-orbit-border bg-orbit-panel p-3">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                detail
              </p>
              <p className="mt-2 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-orbit-text">
                {detailState?.kind ?? "overview"}
              </p>
            </article>
          </div>

          <div className="mt-4 border border-orbit-border bg-orbit-panel p-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
              Top Headline
            </p>
            <h2 className="mt-3 font-display text-[1rem] font-semibold text-orbit-text md:text-[1.12rem]">
              {dashboard.summary.headline}
            </h2>
            <p className="mt-3 text-[0.76rem] leading-[1.65] text-orbit-muted">
              {isLoadingDashboard
                ? "dashboard를 불러오는 중입니다."
                : dashboard.session.loading?.detail ||
                  "Redis materialized dashboard를 BFF 경유로 읽고 있습니다."}
            </p>
            {dashboardError ? (
              <p className="mt-3 border border-orbit-border bg-orbit-bg px-3 py-2 text-[0.72rem] leading-[1.55] text-orbit-muted">
                {dashboardError}
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid min-h-0 flex-1 gap-2">
            {topFeedItems.map((item) => (
              <button
                key={item.documentId}
                type="button"
                className="border border-orbit-border bg-orbit-panel p-3 text-left transition-colors duration-150 hover:border-orbit-accent"
                onClick={() =>
                  void handleSelectDocument(item.documentId, item.referenceUrl)
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                    {item.panelTitle}
                  </span>
                  <span className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-muted">
                    {item.type}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-[0.88rem] font-semibold leading-[1.45] text-orbit-text">
                  {item.title}
                </h3>
                <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                  {item.source} / {item.meta}
                </p>
                <p className="mt-3 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  {item.note}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 gap-3">
          <article className="border border-orbit-border bg-orbit-bg p-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
              Digest Buckets
            </p>
            <div className="mt-3 grid gap-2">
              {dashboard.summary.digests.map((digest) => (
                <button
                  key={digest.id}
                  type="button"
                  className="flex items-center justify-between border border-orbit-border bg-orbit-panel px-3 py-2 text-left transition-colors duration-150 hover:border-orbit-accent"
                  onClick={() => void handleSelectDigest(digest)}
                >
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted">
                    {digest.domain}
                  </span>
                  <span className="font-mono text-[0.72rem] uppercase tracking-[0.12em] text-orbit-text">
                    {digest.evidence}
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="border border-orbit-border bg-orbit-bg p-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
              Runtime Notes
            </p>
            <div className="mt-3 space-y-2 text-[0.76rem] leading-[1.6] text-orbit-muted">
              <p>BFF는 `/api/dashboard`, `/api/digests/:id`, `/api/documents/:id`를 제공합니다.</p>
              <p>dashboard와 reload 진행률은 SSE stream으로 실시간 반영됩니다.</p>
              <p>feed item은 document fetch와 source URL open을 함께 수행합니다.</p>
            </div>
          </article>
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
