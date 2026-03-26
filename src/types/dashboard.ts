import type {
  DigestItem,
  FeedPanel,
  RuntimeItem,
  SessionMetric,
} from "../content/dashboardContent";
import type { JobProgressSnapshot } from "./jobProgress";
import type { SessionDocument } from "./sessionDocument";

export type DashboardStatus =
  | "collecting"
  | "published"
  | "summarizing"
  | "ready"
  | "partial_error"
  | "error";

export type SessionArenaBoardEntry = {
  rank: number | string | null;
  modelName: string | null;
  organization: string | null;
  rating: number | string | null;
  votes: number | string | null;
  url?: string | null;
  license?: string | null;
  contextLength?: number | string | null;
  inputPricePerMillion?: number | string | null;
  outputPricePerMillion?: number | string | null;
};

export type SessionArenaBoard = {
  id: string;
  label: string;
  boardName: string;
  documentId: string;
  referenceUrl: string | null;
  updatedAt: string | null;
  description: string | null;
  totalVotes: number | string | null;
  totalModels: number | string | null;
  scoreLabel: string | null;
  scoreUnit: string | null;
  topModel: SessionArenaBoardEntry;
  topEntries: SessionArenaBoardEntry[];
};

export type SessionArenaOverview = {
  title: string;
  boards: SessionArenaBoard[];
};

export type DashboardLoadingBlockStep = {
  id: string;
  label: string;
  detail?: string | null;
  status: string;
};

export type DashboardLoadingBlock = {
  stage: string;
  stageLabel: string;
  detail: string;
  progressCurrent: number;
  progressTotal: number;
  percent: number;
  currentSource: string | null;
  steps: DashboardLoadingBlockStep[];
};

export type DashboardSession = {
  title: string;
  sessionId: string;
  sessionDate: string;
  window: string;
  reloadRule: string;
  metrics: SessionMetric[];
  runtime: RuntimeItem[];
  loading: JobProgressSnapshot | DashboardLoadingBlock;
  rules: string[];
  arenaOverview: SessionArenaOverview | null;
};

export type DashboardBriefing = {
  body_en: string;
  run_meta?: {
    model_name?: string | null;
    prompt_version?: string | null;
    generated_at?: string | null;
  };
};

export type BriefingStatus = "ready" | "processing" | "disabled" | "error";

export type DashboardSummaryLlmState = {
  enabled: boolean;
  status: BriefingStatus;
  modelName?: string | null;
  summaryReady: boolean;
  filteringReady: boolean;
  labeledPaperCount: number;
  totalPaperCount: number;
  message: string;
  stageLabel?: string | null;
  stageDetail?: string | null;
  stageProgressCurrent?: number;
  stageProgressTotal?: number;
  stageProgressPercent?: number | null;
};

export type DashboardPaperDomainSummary = {
  key: string;
  label: string;
  count: number;
  isUngrouped?: boolean;
};

export type DashboardSourceCountSummary = {
  category: string;
  label: string;
  panelCount: number;
  documentCount: number;
};

export type DashboardResponse = {
  brand: {
    name: string;
    tagline: string;
  };
  status: DashboardStatus;
  session: DashboardSession;
  summary: {
    title: string;
    headline: string;
    briefing?: DashboardBriefing | null;
    briefing_status?: BriefingStatus;
    llm: DashboardSummaryLlmState;
    paperDomains: DashboardPaperDomainSummary[];
    sourceCounts: DashboardSourceCountSummary[];
    digests: DigestItem[];
  };
  feeds: FeedPanel[];
};

export type LeaderboardsResponse = {
  sessionId: string | null;
  status: DashboardStatus;
  leaderboard: SessionArenaOverview | null;
};

export type DigestDetail = DigestItem & {
  documentIds: string[];
  updatedAt: string | null;
};

export type DigestDetailResponse = {
  sessionId: string;
  status: DashboardStatus;
  digest: DigestDetail;
  documents: SessionDocument[];
};

export type SessionReloadStateStatus = DashboardStatus | "idle";

export type SessionReloadStateResponse = {
  session_id: string | null;
  status: SessionReloadStateStatus;
  error: string | null;
  job_id?: string | null;
  poll_path?: string | null;
};
