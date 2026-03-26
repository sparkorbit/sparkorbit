import type {
  DashboardResponse,
  DigestDetailResponse,
  LeaderboardsResponse,
  SessionReloadStateResponse,
} from "../types/dashboard";
import type { SessionDocument } from "../types/sessionDocument";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "";

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function buildStreamUrl(path: string) {
  return buildUrl(path);
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

export function fetchReloadState() {
  return fetchJson<SessionReloadStateResponse>("/api/sessions/reload");
}

export function openDashboardStream(session = "active") {
  return new EventSource(
    buildStreamUrl(`/api/dashboard/stream?session=${encodeURIComponent(session)}`),
  );
}

export function openReloadStream() {
  return new EventSource(buildStreamUrl("/api/sessions/reload/stream"));
}
