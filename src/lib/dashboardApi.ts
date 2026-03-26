import type {
  DashboardResponse,
  DigestDetailResponse,
  LeaderboardsResponse,
  SessionReloadStateResponse,
} from "../types/dashboard";
import type {
  ActiveJobResponse,
  JobProgressSnapshot,
} from "../types/jobProgress";
import type { SessionDocument } from "../types/sessionDocument";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "";

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}


async function fetchJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const raw = await response.text();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          detail?: unknown;
          error?: unknown;
          message?: unknown;
        };
        if (typeof parsed.detail === "string" && parsed.detail.trim()) {
          throw new Error(parsed.detail.trim());
        }
        if (typeof parsed.error === "string" && parsed.error.trim()) {
          throw new Error(parsed.error.trim());
        }
        if (typeof parsed.message === "string" && parsed.message.trim()) {
          throw new Error(parsed.message.trim());
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "SyntaxError") {
          throw error;
        }
      }
    }
    throw new Error(raw || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchDashboard(session = "active") {
  return fetchJson<DashboardResponse>(
    `/api/dashboard?session=${encodeURIComponent(session)}`,
  );
}

export function fetchLeaderboards(session = "active") {
  return fetchJson<LeaderboardsResponse>(
    `/api/leaderboards?session=${encodeURIComponent(session)}`,
  );
}

export function fetchDigestDetail(digestId: string, session = "active") {
  return fetchJson<DigestDetailResponse>(
    `/api/digests/${encodeURIComponent(digestId)}?session=${encodeURIComponent(session)}`,
  );
}

export function fetchDocument(documentId: string, session = "active") {
  return fetchJson<SessionDocument>(
    `/api/documents/${encodeURIComponent(documentId)}?session=${encodeURIComponent(session)}`,
  );
}

export function reloadSession(payload?: {
  profile?: string;
  limit?: number;
  run_label?: string;
  sources?: string[];
}) {
  return fetchJson<SessionReloadStateResponse>(
    "/api/sessions/reload",
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
  );
}

export function fetchActiveJob(surface = "dashboard") {
  return fetchJson<ActiveJobResponse | null>(
    `/api/jobs/active?surface=${encodeURIComponent(surface)}`,
  );
}

export function fetchJobProgress(jobId: string) {
  return fetchJson<JobProgressSnapshot>(
    `/api/jobs/${encodeURIComponent(jobId)}`,
  );
}

export function openDashboardStream(
  onUpdate: (dashboard: DashboardResponse) => void,
  onStreamError: (message: string) => void,
): () => void {
  const es = new EventSource(buildUrl("/api/dashboard/stream"));
  let closed = false;

  es.onmessage = (event) => {
    if (closed) return;
    try {
      const data = JSON.parse(event.data as string) as DashboardResponse;
      onUpdate(data);
    } catch {
      // ignore parse errors
    }
  };

  es.addEventListener("error", (event) => {
    if (closed) return;
    closed = true;
    es.close();
    try {
      const data = JSON.parse((event as MessageEvent).data as string) as {
        detail?: string;
      };
      onStreamError(data.detail ?? "Dashboard stream error.");
    } catch {
      onStreamError("Dashboard stream error.");
    }
  });

  es.onerror = () => {
    if (closed) return;
    closed = true;
    es.close();
    onStreamError("Dashboard stream connection lost.");
  };

  return () => {
    closed = true;
    es.close();
  };
}

export function openJobProgressStream(
  jobId: string,
  onUpdate: (snapshot: JobProgressSnapshot) => void,
  onStreamError: (message: string) => void,
): () => void {
  const es = new EventSource(
    buildUrl(`/api/jobs/${encodeURIComponent(jobId)}/stream`),
  );
  let closed = false;

  es.onmessage = (event) => {
    if (closed) return;
    try {
      const data = JSON.parse(event.data as string) as JobProgressSnapshot;
      onUpdate(data);
      if (
        data.status === "ready" ||
        data.status === "partial_error" ||
        data.status === "error"
      ) {
        closed = true;
        es.close();
      }
    } catch {
      // ignore parse errors
    }
  };

  es.addEventListener("stream_error", (event) => {
    if (closed) return;
    closed = true;
    es.close();
    try {
      const data = JSON.parse((event as MessageEvent).data as string) as {
        detail?: string;
      };
      onStreamError(data.detail ?? "Job stream error.");
    } catch {
      onStreamError("Job stream error.");
    }
  });

  es.onerror = () => {
    if (closed) return;
    closed = true;
    es.close();
    onStreamError("Job stream connection lost.");
  };

  return () => {
    closed = true;
    es.close();
  };
}
