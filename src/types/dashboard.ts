import type {
  DigestItem,
  FeedPanel,
  RuntimeItem,
  SessionMetric,
} from "../content/dashboardContent";
import type { SessionDocument } from "./sessionDocument";

export type DashboardStatus =
  | "collecting"
  | "published"
  | "summarizing"
  | "ready"
  | "partial_error"
  | "error";

export type LoadingStepStatus = "pending" | "active" | "complete" | "error";

export type LoadingStep = {
  id: string;
  label: string;
  detail: string;
  status: LoadingStepStatus;
};

export type DashboardLoading = {
  stage: string;
  stageLabel: string;
  detail: string;
  progressCurrent: number;
  progressTotal: number;
  percent: number;
  currentSource: string | null;
  steps: LoadingStep[];
};

export type DashboardSession = {
  title: string;
  sessionId: string;
  sessionDate: string;
  window: string;
  reloadRule: string;
  metrics: SessionMetric[];
  runtime: RuntimeItem[];
  rules: string[];
  loading: DashboardLoading | null;
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
    digests: DigestItem[];
  };
  feeds: FeedPanel[];
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
  loading: DashboardLoading | null;
  error: string | null;
};
