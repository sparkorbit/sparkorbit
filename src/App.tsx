import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ConsoleHeader,
  GitHubStarPrompt,
  SettingsModal,
} from "./components/app/AppChrome";
import { FullscreenLoading } from "./components/app/FullscreenLoading";
import {
  PayloadDebugPanel,
  type PayloadDebugSnapshot,
} from "./components/app/PayloadDebugPanel";
import { LeaderboardPanel } from "./components/dashboard/LeaderboardPanel";
import { PanelWorkspace } from "./components/dashboard/PanelWorkspace";
import { SourcePanel } from "./components/dashboard/SourcePanel";
import { SummaryPanel } from "./components/dashboard/SummaryPanel";
import { resetPanelWorkspaceStorage } from "./components/dashboard/panelWorkspaceStorage";
import { categoryAccentColor, shell } from "./components/dashboard/styles";
import type { DigestItem, FeedPanel } from "./content/dashboardContent";
import {
  EMPTY_ARENA_BOARDS,
  EMPTY_DASHBOARD,
  EMPTY_LOADING,
  compactText,
  formatReadableSourceTitle,
} from "./features/dashboard/display";
import {
  DigestDetailPanel,
  DocumentDetailPanel,
  type DetailState,
} from "./features/dashboard/detailPanels";
import {
  DEFAULT_UI_SETTINGS,
  loadUiSettings,
  persistUiSettings,
  resolveRowHeightPx,
  type UiSettings,
} from "./features/dashboard/uiSettings";
import {
  fetchActiveJob,
  fetchDashboard,
  fetchDigestDetail,
  fetchDocument,
  fetchJobProgress,
  fetchLeaderboards,
  reloadSession,
} from "./lib/dashboardApi";
import type {
  DashboardLoadingBlock,
  DashboardResponse,
  SessionArenaOverview,
} from "./types/dashboard";
import type {
  ActiveJobResponse,
  JobProgressSnapshot,
} from "./types/jobProgress";

const NOON_AUTO_RELOAD_STORAGE_KEY = "orbit-noon-auto-reload-date";
const NOON_AUTO_RELOAD_HOUR = 12;
const GITHUB_STAR_PROMPT_STORAGE_KEY = "sparkorbit-github-star-prompt-v1";
const GITHUB_STAR_PROMPT_DELAY_MS = 60 * 1000;
const GITHUB_REPO_URL = "https://github.com/sparkorbit/sparkorbit";

function buildLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasPassedNoon(date: Date) {
  return date.getHours() >= NOON_AUTO_RELOAD_HOUR;
}

function readNoonAutoReloadDate() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(NOON_AUTO_RELOAD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeNoonAutoReloadDate(dateKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(NOON_AUTO_RELOAD_STORAGE_KEY, dateKey);
  } catch {
    // ignore storage failures
  }
}

function readGitHubStarPromptState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(GITHUB_STAR_PROMPT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeGitHubStarPromptState(value: "accepted" | "dismissed") {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(GITHUB_STAR_PROMPT_STORAGE_KEY, value);
  } catch {
    // ignore storage failures
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractPayloadStatus(payload: unknown) {
  const record = asRecord(payload);
  return asString(record?.status);
}

function extractPayloadSessionId(payload: unknown) {
  const record = asRecord(payload);
  const session = asRecord(record?.session);

  return (
    asString(record?.sessionId) ??
    asString(record?.session_id) ??
    asString(session?.sessionId)
  );
}

function stringifyPayload(payload: unknown) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function buildFeedSourceSummary(feed: DashboardResponse["feeds"][number]) {
  const uniqueSources = Array.from(
    new Set(feed.items.map((item) => item.source).filter(Boolean)),
  );

  if (uniqueSources.length === 0) {
    return feed.sourceNote || null;
  }

  const visibleSources = uniqueSources.slice(0, 2).join(" / ");
  const extraCount =
    uniqueSources.length > 2 ? ` +${uniqueSources.length - 2}` : "";

  return `${visibleSources}${extraCount}`;
}

function buildInfoPanelMeta(feed: DashboardResponse["feeds"][number]) {
  const count = feed.items.length;
  return `${count} item${count === 1 ? "" : "s"}`;
}

function buildInfoPanelDetail(feed: DashboardResponse["feeds"][number]) {
  if (
    feed.eyebrow === "Paper" ||
    feed.eyebrow === "Community" ||
    feed.eyebrow === "Company" ||
    feed.eyebrow === "Company KR" ||
    feed.eyebrow === "Company CN"
  ) {
    return feed.sourceNote || buildFeedSourceSummary(feed) || undefined;
  }
  return undefined;
}

function buildJobErrorSnapshot(
  current: JobProgressSnapshot | null,
  message: string,
  activeJob: ActiveJobResponse | null,
): JobProgressSnapshot {
  const now = new Date().toISOString();
  const fallback = current ?? EMPTY_LOADING;

  return {
    ...fallback,
    job_id: activeJob?.job_id ?? fallback.job_id,
    surface: activeJob?.surface ?? fallback.surface,
    job_type: activeJob?.job_type ?? fallback.job_type,
    status: "error",
    stage: "error",
    stage_label: "Error",
    detail: message,
    updated_at: now,
    finished_at: now,
    error: {
      message,
      type: "JobProgressError",
    },
  };
}

function isJobProgressSnapshot(
  loading: JobProgressSnapshot | DashboardLoadingBlock,
): loading is JobProgressSnapshot {
  return "stage_label" in loading;
}

function normalizeLoadingSnapshot(
  loading: JobProgressSnapshot | DashboardLoadingBlock,
): JobProgressSnapshot {
  if (isJobProgressSnapshot(loading)) {
    return loading;
  }

  const total = Math.max(loading.progressTotal ?? 0, 0);
  const completed = Math.max(loading.progressCurrent ?? 0, 0);
  const activeSource = loading.currentSource?.trim() || null;

  return {
    ...EMPTY_LOADING,
    status: "running",
    stage: loading.stage,
    stage_label: loading.stageLabel,
    detail: loading.detail,
    percent: loading.percent,
    steps: loading.steps.map((step) => ({
      id: step.id,
      label: step.label,
      status: step.status,
    })),
    source_counts: {
      completed,
      total,
      active: activeSource ? 1 : 0,
      error: 0,
      skipped: 0,
    },
    current_work_item: activeSource
      ? {
          kind: "source",
          id: activeSource,
          label: activeSource,
        }
      : null,
    active_work_items: activeSource
      ? [
          {
            kind: "source",
            id: activeSource,
            label: activeSource,
          },
        ]
      : [],
  };
}

function DetailErrorPanel({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
      <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
        <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                detail error
              </p>
              <h3 className="mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                Could not load this item
              </h3>
            </div>
            <button
              type="button"
              className="shrink-0 border border-orbit-border-strong bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
              onClick={onClose}
            >
              back to list
            </button>
          </div>
          <div className="mt-3 border border-orbit-border bg-orbit-bg px-3 py-3">
            <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.7] text-orbit-text">
              {message}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

class DetailRenderBoundary extends Component<
  {
    children: ReactNode;
    onClose: () => void;
    resetKey: string;
  },
  { message: string | null }
> {
  state = {
    message: null,
  };

  static getDerivedStateFromError(error: unknown) {
    return {
      message:
        error instanceof Error
          ? compactText(error.message, 180)
          : "Could not render this item.",
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    void error;
    void errorInfo;
    // The in-panel fallback is enough for this workspace lane.
  }

  componentDidUpdate(prevProps: Readonly<{ resetKey: string }>) {
    if (
      prevProps.resetKey !== this.props.resetKey &&
      this.state.message !== null
    ) {
      this.setState({ message: null });
    }
  }

  render() {
    if (this.state.message !== null) {
      return (
        <DetailErrorPanel
          message={this.state.message}
          onClose={this.props.onClose}
        />
      );
    }
    return this.props.children;
  }
}

function App() {
  const [dashboard, setDashboard] =
    useState<DashboardResponse>(EMPTY_DASHBOARD);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>(null);
  const [selectedDigestId, setSelectedDigestId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [uiSettings, setUiSettings] = useState<UiSettings>(loadUiSettings);
  const [leaderboardOverview, setLeaderboardOverview] =
    useState<SessionArenaOverview | null>(null);
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [payloadSnapshots, setPayloadSnapshots] = useState<
    PayloadDebugSnapshot[]
  >([]);
  const [isPayloadDebugOpen, setIsPayloadDebugOpen] = useState(false);
  const [hasStarPromptDelayElapsed, setHasStarPromptDelayElapsed] =
    useState(false);
  const [isGitHubStarPromptOpen, setIsGitHubStarPromptOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJobResponse | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgressSnapshot | null>(
    null,
  );
  const detailRequestVersionRef = useRef(0);
  const currentDashboardSessionIdRef = useRef(
    EMPTY_DASHBOARD.session.sessionId,
  );

  const rowHeightPx = resolveRowHeightPx(uiSettings.rowHeightMode);

  function recordPayloadSnapshot({
    key,
    title,
    path,
    transport,
    payload,
  }: {
    key: string;
    title: string;
    path: string;
    transport: PayloadDebugSnapshot["transport"];
    payload: unknown;
  }) {
    const snapshot: PayloadDebugSnapshot = {
      key,
      title,
      path,
      transport,
      receivedAt: new Date().toISOString(),
      status: extractPayloadStatus(payload),
      sessionId: extractPayloadSessionId(payload),
      jsonText: stringifyPayload(payload),
    };

    setPayloadSnapshots((current) => [
      snapshot,
      ...current.filter((entry) => entry.key !== key),
    ]);
  }

  async function loadDashboardData(
    session = "active",
    options?: { preserveCurrent?: boolean },
  ) {
    try {
      const payload = await fetchDashboard(session);
      recordPayloadSnapshot({
        key: "dashboard-fetch",
        title: "dashboard fetch",
        path: `/api/dashboard?session=${session}`,
        transport: "http",
        payload,
      });
      setDashboard(payload);
      setDashboardError(null);
      return payload;
    } catch (error) {
      if (!options?.preserveCurrent) {
        setDashboard((current) =>
          current.session.sessionId === EMPTY_DASHBOARD.session.sessionId
            ? EMPTY_DASHBOARD
            : current,
        );
      }
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "Failed to connect to BFF API.",
      );
      return null;
    } finally {
      setIsLoadingDashboard(false);
    }
  }

  async function loadJobProgressData(job: ActiveJobResponse) {
    try {
      const payload = await fetchJobProgress(job.job_id);
      recordPayloadSnapshot({
        key: "job-progress",
        title: "job progress",
        path: job.poll_path,
        transport: "http",
        payload,
      });
      setJobProgress(payload);
      return payload;
    } catch (error) {
      const message =
        error instanceof Error
          ? compactText(error.message, 180)
          : "Failed to read job progress.";
      setJobProgress((current) => buildJobErrorSnapshot(current, message, job));
      return null;
    }
  }

  useEffect(() => {
    let isDisposed = false;

    async function loadInitialState() {
      try {
        const active = await fetchActiveJob("dashboard");
        if (isDisposed) {
          return;
        }
        recordPayloadSnapshot({
          key: "job-active",
          title: "active job",
          path: "/api/jobs/active?surface=dashboard",
          transport: "http",
          payload: active,
        });

        if (active) {
          setActiveJob(active);
          if (
            dashboard.session.sessionId === EMPTY_DASHBOARD.session.sessionId
          ) {
            await loadDashboardData("active", { preserveCurrent: true });
            if (isDisposed) {
              return;
            }
          }
          const progress = await loadJobProgressData(active);
          if (isDisposed) {
            return;
          }
          if (progress?.status === "ready" || progress?.status === "partial_error") {
            setActiveJob(null);
            await loadDashboardData("active", { preserveCurrent: true });
          } else if (
            progress?.status === "error" &&
            dashboard.session.sessionId !== EMPTY_DASHBOARD.session.sessionId
          ) {
            setActiveJob(null);
            setDashboardError(
              compactText(
                progress.error?.message ?? "The active job ended with an error.",
                180,
              ),
            );
          }
          return;
        }

        const payload = await loadDashboardData("active");
        if (isDisposed || payload) {
          return;
        }

        const retryActive = await fetchActiveJob("dashboard");
        if (isDisposed) {
          return;
        }
        recordPayloadSnapshot({
          key: "job-active-retry",
          title: "active job retry",
          path: "/api/jobs/active?surface=dashboard",
          transport: "http",
          payload: retryActive,
        });
        if (!retryActive) {
          return;
        }
        setActiveJob(retryActive);
        await loadJobProgressData(retryActive);
      } catch (error) {
        if (isDisposed) {
          return;
        }
        setDashboardError(
          error instanceof Error
            ? compactText(error.message, 180)
            : "Failed to connect to BFF API.",
        );
        setIsLoadingDashboard(false);
      }
    }

    void loadInitialState();

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    persistUiSettings(uiSettings);
  }, [uiSettings]);

  useEffect(() => {
    if (!uiSettings.payloadDebugEnabled) {
      setIsPayloadDebugOpen(false);
    }
  }, [uiSettings.payloadDebugEnabled]);

  useEffect(() => {
    if (readGitHubStarPromptState()) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setHasStarPromptDelayElapsed(true);
    }, GITHUB_STAR_PROMPT_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    currentDashboardSessionIdRef.current = dashboard.session.sessionId;
  }, [dashboard.session.sessionId]);

  useEffect(() => {
    detailRequestVersionRef.current += 1;
    setDetailState(null);
    setDetailError(null);
    setSelectedDigestId(null);
    setSelectedDocumentId(null);
  }, [dashboard.session.sessionId]);

  useEffect(() => {
    if (activeJob) {
      setLeaderboardOverview(null);
      setLeaderboardError(null);
      setIsLoadingLeaderboards(false);
      return;
    }

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
        recordPayloadSnapshot({
          key: "leaderboards-fetch",
          title: "leaderboards fetch",
          path: `/api/leaderboards?session=${sessionId}`,
          transport: "http",
          payload,
        });
        setLeaderboardOverview(payload.leaderboard);
      } catch (error) {
        if (isDisposed) {
          return;
        }
        setLeaderboardOverview(null);
        setLeaderboardError(
          error instanceof Error
            ? compactText(error.message, 180)
            : "Failed to fetch leaderboard API.",
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
  }, [activeJob, dashboard.session.sessionId, dashboard.status]);

  useEffect(() => {
    if (!activeJob) {
      return;
    }

    const currentJob = activeJob;
    let isDisposed = false;

    async function pollJob() {
      const payload = await loadJobProgressData(currentJob);
      if (isDisposed || !payload) {
        return;
      }

      if (payload.status === "ready" || payload.status === "partial_error") {
        setActiveJob(null);
        await loadDashboardData("active", { preserveCurrent: true });
        return;
      }

      if (payload.status === "error") {
        setActiveJob(null);
        if (dashboard.session.sessionId !== EMPTY_DASHBOARD.session.sessionId) {
          setDashboardError(
            compactText(
              payload.error?.message ?? "The active job ended with an error.",
              180,
            ),
          );
        }
      }
    }

    void pollJob();
    const intervalId = window.setInterval(() => {
      void pollJob();
    }, 1500);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [activeJob, dashboard.session.sessionId]);

  function resetWorkspaceLayout() {
    detailRequestVersionRef.current += 1;
    resetPanelWorkspaceStorage();
    setDetailState(null);
    setDetailError(null);
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
    const sessionId = currentDashboardSessionIdRef.current;
    const requestVersion = detailRequestVersionRef.current + 1;
    detailRequestVersionRef.current = requestVersion;
    setSelectedDigestId(digest.id);
    setSelectedDocumentId(null);
    setDetailState(null);
    setDetailError(null);

    try {
      const payload = await fetchDigestDetail(digest.id, sessionId);
      if (
        detailRequestVersionRef.current !== requestVersion ||
        currentDashboardSessionIdRef.current !== sessionId
      ) {
        return;
      }
      recordPayloadSnapshot({
        key: "digest-detail",
        title: "digest detail",
        path: `/api/digests/${digest.id}?session=${encodeURIComponent(sessionId)}`,
        transport: "http",
        payload,
      });
      setDetailState({ kind: "digest", payload });
      setDetailError(null);
    } catch (error) {
      if (
        detailRequestVersionRef.current !== requestVersion ||
        currentDashboardSessionIdRef.current !== sessionId
      ) {
        return;
      }
      setDetailError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "Failed to fetch digest detail.",
      );
    }
  }

  async function handleSelectDocument(documentId: string) {
    const sessionId = currentDashboardSessionIdRef.current;
    const requestVersion = detailRequestVersionRef.current + 1;
    detailRequestVersionRef.current = requestVersion;
    setSelectedDocumentId(documentId);
    setSelectedDigestId(null);
    setDetailState(null);
    setDetailError(null);

    try {
      const payload = await fetchDocument(documentId, sessionId);
      if (
        detailRequestVersionRef.current !== requestVersion ||
        currentDashboardSessionIdRef.current !== sessionId
      ) {
        return;
      }
      recordPayloadSnapshot({
        key: "document-detail",
        title: "document detail",
        path: `/api/documents/${documentId}?session=${encodeURIComponent(sessionId)}`,
        transport: "http",
        payload,
      });
      setDetailState({ kind: "document", payload });
      setDetailError(null);
    } catch (error) {
      if (
        detailRequestVersionRef.current !== requestVersion ||
        currentDashboardSessionIdRef.current !== sessionId
      ) {
        return;
      }
      setDetailError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "Failed to fetch document detail.",
      );
    }
  }

  async function handleReloadSession() {
    detailRequestVersionRef.current += 1;
    setActiveJob(null);
    setJobProgress(null);
    setDashboardError(null);
    setDetailState(null);
    setDetailError(null);
    setSelectedDigestId(null);
    setSelectedDocumentId(null);
    try {
      const result = await reloadSession({
        profile: "full",
        run_label: "redis-session",
      });
      recordPayloadSnapshot({
        key: "reload-start",
        title: "reload start",
        path: "/api/sessions/reload",
        transport: "http",
        payload: result,
      });
      if (result.job_id && result.poll_path) {
        const nextActiveJob: ActiveJobResponse = {
          job_id: result.job_id,
          poll_path: result.poll_path,
          surface: "dashboard",
          job_type: "session_reload",
          status: result.status,
        };
        setActiveJob(nextActiveJob);
        await loadJobProgressData(nextActiveJob);
      }
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "Reload request failed.",
      );
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const maybeAutoReloadAtNoon = () => {
      if (
        isLoadingDashboard ||
        activeJob !== null ||
        dashboard.status === "collecting"
      ) {
        return;
      }

      const now = new Date();
      if (!hasPassedNoon(now)) {
        return;
      }

      const todayKey = buildLocalDateKey(now);
      if (readNoonAutoReloadDate() === todayKey) {
        return;
      }

      writeNoonAutoReloadDate(todayKey);
      void handleReloadSession();
    };

    maybeAutoReloadAtNoon();
    const timerId = window.setInterval(maybeAutoReloadAtNoon, 60_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [dashboard.status, isLoadingDashboard, activeJob]);

  const hasUsableDashboard =
    dashboard.session.sessionId !== EMPTY_DASHBOARD.session.sessionId;
  const loadingSnapshot = normalizeLoadingSnapshot(
    jobProgress ?? dashboard.session.loading,
  );
  const shouldShowFullscreenLoading =
    activeJob !== null ||
    dashboard.status === "collecting" ||
    (!hasUsableDashboard && jobProgress?.status === "error");

  const resolvedArenaOverview =
    leaderboardOverview ?? dashboard.session.arenaOverview;
  const arenaBoards = (resolvedArenaOverview?.boards ?? EMPTY_ARENA_BOARDS).filter(
    (board) => board.id !== "open_llm_leaderboard",
  );

  const infoItems = dashboard.feeds
    .filter((feed) => feed.eyebrow !== "Benchmark")
    .flatMap((feed) => {
      if (feed.id === "hf_trending_models") {
        const parseNoteMetric = (note: string, key: string) => {
          const match = note.match(new RegExp(`${key}\\s+([\\d,]+)`));
          return match ? Number(match[1].replace(/,/g, "")) : 0;
        };

        const byLikes: FeedPanel = {
          ...feed,
          id: "hf_trending_by_likes",
          title: "[Model] HF Trending by Likes",
          items: [...feed.items]
            .sort(
              (a, b) =>
                parseNoteMetric(b.note, "♥") - parseNoteMetric(a.note, "♥"),
            )
            .map((item) => ({
              ...item,
              timestamp: null,
              engagementLabel: `liked ${parseNoteMetric(item.note, "♥").toLocaleString()}`,
            })),
        };

        const byDownloads: FeedPanel = {
          ...feed,
          id: "hf_trending_by_downloads",
          title: "[Model] HF Trending by Downloads",
          items: [...feed.items]
            .sort(
              (a, b) =>
                parseNoteMetric(b.note, "↓") -
                parseNoteMetric(a.note, "↓"),
            )
            .map((item) => ({
              ...item,
              timestamp: null,
              engagementLabel: `downloads ${parseNoteMetric(item.note, "↓").toLocaleString()}`,
            })),
        };

        return [byLikes, byDownloads].map((splitFeed) => ({
          id: splitFeed.id,
          label: splitFeed.eyebrow,
          title: splitFeed.title,
          meta: buildInfoPanelMeta(splitFeed),
          detail: buildInfoPanelDetail(splitFeed),
          accentColor: categoryAccentColor(splitFeed.eyebrow),
          node: (
            <SourcePanel
              panelData={splitFeed}
              selectedDocumentId={selectedDocumentId}
              onSelectItem={handleSelectDocument}
            />
          ),
          defaultRowSpan: 1,
          defaultColSpan: 1,
        }));
      }

      const isEngagementSorted =
        feed.id === "github_curated_repos" ||
        feed.id.startsWith("reddit_");

      const resolvedFeed = isEngagementSorted
        ? {
            ...feed,
            items: feed.items.map((item) => ({
              ...item,
              timestamp: null,
            })),
          }
        : feed;

      return [
        {
          id: resolvedFeed.id,
          label: resolvedFeed.eyebrow,
          title: resolvedFeed.title,
          meta: buildInfoPanelMeta(resolvedFeed),
          detail: buildInfoPanelDetail(resolvedFeed),
          accentColor: categoryAccentColor(resolvedFeed.eyebrow),
          node: (
            <SourcePanel
              panelData={resolvedFeed}
              selectedDocumentId={selectedDocumentId}
              onSelectItem={handleSelectDocument}
            />
          ),
          defaultRowSpan: 1,
          defaultColSpan: 1,
        },
      ];
    })
    .sort((a, b) => {
      // Ensure HF Trending Likes/Downloads always come before other Model panels
      const priorityIds = ["hf_trending_by_likes", "hf_trending_by_downloads"];
      const aIdx = priorityIds.indexOf(a.id);
      const bIdx = priorityIds.indexOf(b.id);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return 0;
    });

  const summaryPanel = (
    <SummaryPanel
      title={dashboard.summary.title}
      digests={dashboard.summary.digests}
      briefing={dashboard.summary.briefing}
      briefingStatus={dashboard.summary.briefing_status}
      selectedDigestId={selectedDigestId}
      onSelectDigest={handleSelectDigest}
    />
  );

  const infoPanelOverride =
    detailState?.kind === "digest"
      ? {
          title: `${detailState.payload.digest.domain} Overview`,
          node: (
            <DetailRenderBoundary
              resetKey={`digest:${detailState.payload.digest.id}`}
              onClose={() => {
                setDetailState(null);
                setDetailError(null);
                setSelectedDigestId(null);
              }}
            >
              <DigestDetailPanel
                payload={detailState.payload}
                onClose={() => {
                  setDetailState(null);
                  setDetailError(null);
                  setSelectedDigestId(null);
                }}
                onOpenDocument={handleSelectDocument}
              />
            </DetailRenderBoundary>
          ),
        }
      : detailState?.kind === "document"
        ? {
            title: formatReadableSourceTitle(
              detailState.payload.source_category,
              detailState.payload.source,
            ),
            node: (
              <DetailRenderBoundary
                resetKey={`document:${detailState.payload.document_id}`}
                onClose={() => {
                  setDetailState(null);
                  setDetailError(null);
                  setSelectedDocumentId(null);
                }}
              >
                <DocumentDetailPanel
                  document={detailState.payload}
                  onClose={() => {
                    setDetailState(null);
                    setDetailError(null);
                    setSelectedDocumentId(null);
                  }}
                />
              </DetailRenderBoundary>
            ),
          }
        : detailError
          ? {
              title: "Error",
              node: (
                <DetailErrorPanel
                  message={detailError}
                  onClose={() => {
                    setDetailError(null);
                    setDetailState(null);
                    setSelectedDigestId(null);
                    setSelectedDocumentId(null);
                  }}
                />
              ),
            }
        : undefined;

  const mainPanel = (
    <LeaderboardPanel
      arenaBoards={arenaBoards}
      isLoadingLeaderboards={isLoadingLeaderboards}
      leaderboardError={leaderboardError}
      dashboardError={dashboardError}
    />
  );

  const overlays = uiSettings.overlaysEnabled ? (
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
  ) : null;
  const payloadDebugOverlay = uiSettings.payloadDebugEnabled ? (
    <PayloadDebugPanel
      snapshots={payloadSnapshots}
      isOpen={isPayloadDebugOpen}
      onToggle={() => setIsPayloadDebugOpen((current) => !current)}
    />
  ) : null;

  useEffect(() => {
    if (
      !hasStarPromptDelayElapsed ||
      isGitHubStarPromptOpen ||
      shouldShowFullscreenLoading ||
      isSettingsOpen ||
      readGitHubStarPromptState()
    ) {
      return;
    }

    setIsGitHubStarPromptOpen(true);
  }, [
    hasStarPromptDelayElapsed,
    isGitHubStarPromptOpen,
    isSettingsOpen,
    shouldShowFullscreenLoading,
  ]);

  function handleAcceptGitHubStarPrompt() {
    writeGitHubStarPromptState("accepted");
    setIsGitHubStarPromptOpen(false);
    window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer");
  }

  function handleLaterGitHubStarPrompt() {
    setIsGitHubStarPromptOpen(false);
  }

  function handleDismissGitHubStarPrompt() {
    writeGitHubStarPromptState("dismissed");
    setIsGitHubStarPromptOpen(false);
  }

  return (
    <div
      data-orbit-motion={uiSettings.motionEnabled ? "on" : "off"}
      className="relative flex h-dvh w-screen flex-col overflow-hidden bg-orbit-bg font-body text-orbit-text"
    >
      {overlays}

      <ConsoleHeader
        title={dashboard.brand.name}
        subtitle={dashboard.brand.tagline}
        repoUrl={GITHUB_REPO_URL}
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

      <FullscreenLoading
        progress={loadingSnapshot}
        visible={shouldShowFullscreenLoading}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        briefingStatus={dashboard?.summary?.briefing_status}
        onClose={() => setIsSettingsOpen(false)}
        onRestoreDefaults={restoreDefaultSettings}
      />
      <GitHubStarPrompt
        isOpen={isGitHubStarPromptOpen}
        onAccept={handleAcceptGitHubStarPrompt}
        onLater={handleLaterGitHubStarPrompt}
        onDismissForever={handleDismissGitHubStarPrompt}
      />
      {payloadDebugOverlay}
    </div>
  );
}

export default App;
