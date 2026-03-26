import { useEffect, useState } from "react";

import {
  ConsoleHeader,
  SettingsModal,
} from "./components/app/AppChrome";
import {
  PayloadDebugPanel,
  type PayloadDebugSnapshot,
} from "./components/app/PayloadDebugPanel";
import { FullscreenLoading } from "./components/app/FullscreenLoading";
import { LeaderboardPanel } from "./components/dashboard/LeaderboardPanel";
import { PanelWorkspace } from "./components/dashboard/PanelWorkspace";
import { SourcePanel } from "./components/dashboard/SourcePanel";
import { SummaryPanel } from "./components/dashboard/SummaryPanel";
import { resetPanelWorkspaceStorage } from "./components/dashboard/panelWorkspaceStorage";
import { shell } from "./components/dashboard/styles";
import type { DigestItem } from "./content/dashboardContent";
import {
  EMPTY_ARENA_BOARDS,
  EMPTY_DASHBOARD,
  buildLeaderboardEntries,
  buildPanelSessionLabel,
  compactText,
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
  DashboardResponse,
  SessionArenaOverview,
} from "./types/dashboard";
import type {
  ActiveJobResponse,
  JobProgressSnapshot,
} from "./types/jobProgress";

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

function buildJobErrorSnapshot(
  current: JobProgressSnapshot | null,
  message: string,
  activeJob: ActiveJobResponse | null,
): JobProgressSnapshot {
  const now = new Date().toISOString();
  const fallback = current ?? EMPTY_DASHBOARD.session.loading;

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

function App() {
  const [dashboard, setDashboard] =
    useState<DashboardResponse>(EMPTY_DASHBOARD);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>(null);
  const [selectedDigestId, setSelectedDigestId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [uiSettings, setUiSettings] = useState<UiSettings>(loadUiSettings);
  const [leaderboardOverview, setLeaderboardOverview] =
    useState<SessionArenaOverview | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [selectedLeaderboardId, setSelectedLeaderboardId] = useState<
    string | null
  >(null);
  const [payloadSnapshots, setPayloadSnapshots] = useState<
    PayloadDebugSnapshot[]
  >([]);
  const [isPayloadDebugOpen, setIsPayloadDebugOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJobResponse | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgressSnapshot | null>(
    null,
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

  useEffect(() => {
    if (activeJob) {
      setLeaderboardOverview(null);
      setLeaderboardError(null);
      return;
    }

    const sessionId = dashboard.session.sessionId;
    if (
      sessionId === EMPTY_DASHBOARD.session.sessionId ||
      dashboard.status === "collecting"
    ) {
      setLeaderboardOverview(null);
      setLeaderboardError(null);
      return;
    }

    let isDisposed = false;

    async function loadLeaderboards() {
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
      }
    }

    void loadLeaderboards();

    return () => {
      isDisposed = true;
    };
  }, [activeJob, dashboard.session.sessionId, dashboard.status]);

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
      recordPayloadSnapshot({
        key: "digest-detail",
        title: "digest detail",
        path: `/api/digests/${digest.id}?session=active`,
        transport: "http",
        payload,
      });
      setDetailState({ kind: "digest", payload });
      setDashboardError(null);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "Failed to fetch digest detail.",
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
      recordPayloadSnapshot({
        key: "document-detail",
        title: "document detail",
        path: `/api/documents/${documentId}?session=active`,
        transport: "http",
        payload,
      });
      setDetailState({ kind: "document", payload });
      setDashboardError(null);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? compactText(error.message, 180)
          : "Failed to fetch document detail.",
      );
    }
  }

  async function handleReloadSession() {
    setDashboardError(null);
    setDetailState(null);
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

  const sessionLabel = `${dashboard.session.sessionDate} / ${dashboard.session.window}`;
  const panelSessionLabel = buildPanelSessionLabel(
    dashboard.session.sessionDate,
    dashboard.session.window,
  );
  const hasUsableDashboard =
    dashboard.session.sessionId !== EMPTY_DASHBOARD.session.sessionId;
  const loadingSnapshot = jobProgress ?? dashboard.session.loading;
  const shouldShowLoadingOverlay =
    activeJob !== null ||
    (!hasUsableDashboard && jobProgress?.status === "error");
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
    label: feed.eyebrow,
    title: feed.title,
    meta: `${feed.items.length} items`,
    detail: buildFeedSourceSummary(feed) ?? undefined,
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
      sessionLabel={panelSessionLabel}
      selectedDigestId={selectedDigestId}
      onSelectDigest={handleSelectDigest}
    />
  );

  const infoPanelOverride =
    detailState?.kind === "digest"
      ? {
          title: `${detailState.payload.digest.domain} Sweep`,
          node: (
            <DigestDetailPanel
              payload={detailState.payload}
              onClose={() => {
                setDetailState(null);
                setSelectedDigestId(null);
              }}
              onOpenDocument={handleSelectDocument}
            />
          ),
        }
      : detailState?.kind === "document"
        ? {
            title: `${detailState.payload.source} Trace`,
            node: (
              <DocumentDetailPanel
                document={detailState.payload}
                onClose={() => {
                  setDetailState(null);
                  setSelectedDocumentId(null);
                }}
              />
            ),
          }
        : undefined;

  const mainPanel = (
    <LeaderboardPanel
      sessionLabel={sessionLabel}
      onReload={() => void handleReloadSession()}
      isReloading={activeJob !== null}
      resolvedArenaOverview={resolvedArenaOverview}
      selectedArenaBoard={selectedArenaBoard}
      arenaBoards={arenaBoards}
      leaderboardEntries={leaderboardEntries}
      leaderboardError={leaderboardError}
      dashboardError={dashboardError}
      onSelectBoard={setSelectedLeaderboardId}
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

      <FullscreenLoading
        progress={loadingSnapshot}
        visible={shouldShowLoadingOverlay}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={uiSettings}
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
