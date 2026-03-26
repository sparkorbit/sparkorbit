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
  FullscreenLoading,
  SettingsModal,
} from "./components/app/AppChrome";
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
import type { DigestItem } from "./content/dashboardContent";
import {
  EMPTY_ARENA_BOARDS,
  EMPTY_DASHBOARD,
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
  SessionArenaOverview,
  SessionReloadStateResponse,
} from "./types/dashboard";

const NOON_AUTO_RELOAD_STORAGE_KEY = "orbit-noon-auto-reload-date";
const NOON_AUTO_RELOAD_HOUR = 12;

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
  const [payloadSnapshots, setPayloadSnapshots] = useState<
    PayloadDebugSnapshot[]
  >([]);
  const [isPayloadDebugOpen, setIsPayloadDebugOpen] = useState(false);
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

  useEffect(() => {
    let isDisposed = false;
    let dashboardStream: EventSource | null = null;

    async function loadDashboardData(session = "active") {
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
        setDashboard((current) =>
          current.session.sessionId === EMPTY_DASHBOARD.session.sessionId
            ? EMPTY_DASHBOARD
            : current,
        );
        setDashboardError(
          error instanceof Error
            ? compactText(error.message, 180)
            : "Failed to connect to the dashboard API.",
        );
        return EMPTY_DASHBOARD;
      } finally {
        setIsLoadingDashboard(false);
      }
    }

    async function resumeReloadIfNeeded() {
      try {
        const payload = await fetchReloadState();
        recordPayloadSnapshot({
          key: "reload-state",
          title: "reload state",
          path: "/api/sessions/reload",
          transport: "http",
          payload,
        });
        if (isDisposed) {
          return;
        }
        if (
          payload.status === "collecting" ||
          payload.status === "published" ||
          payload.status === "summarizing"
        ) {
          setBlockingLoadingState(payload.loading);
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
          recordPayloadSnapshot({
            key: "dashboard-stream",
            title: "dashboard stream",
            path: "/api/dashboard/stream?session=active",
            transport: "sse",
            payload,
          });
          setDashboard(payload);
          setDashboardError(null);
        } catch (error) {
          setDashboardError(
            error instanceof Error
              ? compactText(error.message, 180)
              : "Failed to parse dashboard stream payload.",
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
    if (!isReloading || typeof EventSource === "undefined") {
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
        recordPayloadSnapshot({
          key: "reload-stream",
          title: "reload stream",
          path: "/api/sessions/reload/stream",
          transport: "sse",
          payload,
        });
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
              payload.error ?? "An error occurred during refresh.",
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
            : "Failed to parse reload stream payload.",
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
      setDashboardError("Reload stream connection lost.");
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
    persistUiSettings(uiSettings);
  }, [uiSettings]);

  useEffect(() => {
    if (!uiSettings.payloadDebugEnabled) {
      setIsPayloadDebugOpen(false);
    }
  }, [uiSettings.payloadDebugEnabled]);

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
  }, [dashboard.session.sessionId, dashboard.status]);

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
    setIsReloading(true);
    setBlockingLoadingState(null);
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
      setBlockingLoadingState(result.loading);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "Reload request failed.",
      );
      setBlockingLoadingState(null);
      setIsReloading(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const maybeAutoReloadAtNoon = () => {
      if (
        isLoadingDashboard ||
        isReloading ||
        blockingLoadingState !== null ||
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
  }, [dashboard.status, isLoadingDashboard, isReloading, blockingLoadingState]);

  const sessionLabel = dashboard.session.sessionDate;
  const fullscreenLoadingState =
    dashboard.status === "collecting"
      ? dashboard.session.loading
      : blockingLoadingState || null;
  const shouldShowFullscreenLoading =
    isLoadingDashboard ||
    blockingLoadingState !== null ||
    dashboard.status === "collecting";

  const resolvedArenaOverview =
    leaderboardOverview ?? dashboard.session.arenaOverview;
  const arenaBoards = resolvedArenaOverview?.boards ?? EMPTY_ARENA_BOARDS;

  const infoItems = dashboard.feeds
    .filter((feed) => feed.eyebrow !== "Benchmark")
    .map((feed) => ({
      id: feed.id,
      label: feed.eyebrow,
      title: feed.title,
      meta: `${feed.items.length} items`,
      detail: buildFeedSourceSummary(feed) ?? undefined,
      accentColor: categoryAccentColor(feed.eyebrow),
      node: (
        <SourcePanel
          panelData={feed}
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
      sessionLabel={sessionLabel}
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

  if (shouldShowFullscreenLoading) {
    return (
      <div
        data-orbit-motion={uiSettings.motionEnabled ? "on" : "off"}
        className="relative flex h-dvh w-screen flex-col overflow-hidden bg-orbit-bg font-body text-orbit-text"
      >
        {overlays}
        <FullscreenLoading
          brand={dashboard.brand}
          loading={fullscreenLoadingState}
        />
        {payloadDebugOverlay}
      </div>
    );
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
        briefingStatus={dashboard?.summary?.briefing_status}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={setUiSettings}
        onResetWorkspace={resetWorkspaceLayout}
        onRestoreDefaults={restoreDefaultSettings}
      />
      {payloadDebugOverlay}
    </div>
  );
}

export default App;
