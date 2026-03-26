import type { CSSProperties } from "react";

import { buildLeaderboardEntries } from "../../features/dashboard/display";
import type {
  SessionArenaBoard,
  SessionArenaBoardEntry,
} from "../../types/dashboard";

type LeaderboardPanelProps = {
  sessionLabel: string;
  arenaBoards: readonly SessionArenaBoard[];
  isLoadingLeaderboards: boolean;
  leaderboardError: string | null;
  dashboardError: string | null;
};

const MAX_ENTRIES = 10;

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stripArenaName(value: string | null | undefined) {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/\bLMArena\b/gi, "")
    .replace(/\bArena\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[-: ]+|[-: ]+$/g, "")
    .trim();
}

function resolveBoardTitle(board: SessionArenaBoard) {
  return (
    stripArenaName(board.boardName) ||
    stripArenaName(board.label) ||
    "Benchmark"
  );
}

function formatHumanScore(value: number | string | null | undefined) {
  const rating = toFiniteNumber(value);
  if (rating == null) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(rating));
}

function resolveHumanScore(entry: SessionArenaBoardEntry) {
  const rating = toFiniteNumber(entry.rating);
  if (rating != null && rating > 0) {
    return formatHumanScore(rating);
  }

  return null;
}

function EntryCard({
  entry,
  delayMs = 0,
}: {
  entry: SessionArenaBoardEntry;
  delayMs?: number;
}) {
  const humanScore = resolveHumanScore(entry);

  return (
    <article
      className="orbit-leaderboard-entry orbit-hacker-reveal"
      style={{ "--hacker-delay": `${delayMs}ms` } as CSSProperties}
    >
      <div className="orbit-hacker-reveal__content flex min-w-0 items-center gap-0">
        <div className="flex w-6 shrink-0 items-center justify-center self-stretch">
          <span className="font-mono text-[0.56rem] tabular-nums text-orbit-muted">
            {entry.rank ?? "—"}
          </span>
        </div>

        <div className="orbit-leaderboard-entry__body min-w-0 flex-1 border-l border-orbit-border px-2 py-2">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            {entry.url ? (
              <a
                href={entry.url}
                target="_blank"
                rel="noreferrer"
                className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.76rem] font-semibold leading-snug text-orbit-text hover:text-orbit-accent"
              >
                {entry.modelName ?? "—"}
              </a>
            ) : (
              <h3 className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.76rem] font-semibold leading-snug text-orbit-text">
                {entry.modelName ?? "—"}
              </h3>
            )}
            {humanScore ? (
              <span className="shrink-0 font-mono text-[0.58rem] tabular-nums text-orbit-accent">
                {humanScore}
              </span>
            ) : null}
          </div>

          {entry.organization ? (
            <p className="mt-0.5 font-mono text-[0.52rem] uppercase tracking-widest text-orbit-muted">
              {entry.organization}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BoardCard({
  board,
}: {
  board: SessionArenaBoard;
}) {
  const entries = buildLeaderboardEntries(board).slice(0, MAX_ENTRIES);

  return (
    <article className="flex h-full min-h-0 w-[24rem] flex-none snap-start flex-col border border-orbit-border bg-orbit-bg sm:w-[26rem] lg:w-[28rem] xl:w-[30rem]">
      <div className="border-b border-orbit-border px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="orbit-wrap-anywhere font-display text-[0.88rem] font-semibold text-orbit-text">
              {resolveBoardTitle(board)}
            </h3>
          </div>
          {board.referenceUrl ? (
            <a
              href={board.referenceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
            >
              open
            </a>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {entries.length > 0 ? (
          <div className="grid gap-1">
            {entries.map((entry, index) => (
              <EntryCard
                key={`${board.id}-${entry.rank}-${entry.modelName}`}
                entry={entry}
                delayMs={index * 35}
              />
            ))}
          </div>
        ) : (
          <p className="px-2 py-3 font-mono text-[0.58rem] text-orbit-muted">
            no models ranked yet
          </p>
        )}
      </div>
    </article>
  );
}

export function LeaderboardPanel({
  sessionLabel,
  arenaBoards,
  isLoadingLeaderboards,
  leaderboardError,
  dashboardError,
}: LeaderboardPanelProps) {
  const errorMessage = leaderboardError ?? dashboardError;

  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="orbit-wrap-anywhere font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.32rem]">
            AI Model Leaderboard
          </h1>
        </div>

        <div className="flex shrink-0 items-center justify-end">
          <span className="orbit-token-ellipsis inline-flex max-w-[16rem] border border-orbit-border-strong bg-orbit-bg px-2 py-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-orbit-text">
            {sessionLabel}
          </span>
        </div>
      </div>

      {isLoadingLeaderboards ? (
        <div className="mt-3">
          <p className="font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted">
            loading leaderboard data...
          </p>
        </div>
      ) : null}

      {errorMessage && arenaBoards.length > 0 ? (
        <div className="mt-3 border border-orbit-border bg-orbit-bg px-3 py-2">
          <p className="text-[0.68rem] leading-[1.5] text-orbit-muted">
            {errorMessage}
          </p>
        </div>
      ) : null}

      <div className="mt-4 min-h-0 flex-1">
        {errorMessage && arenaBoards.length === 0 ? (
          <div className="flex h-full items-center justify-center border border-orbit-border bg-orbit-bg px-4 py-6">
            <p className="max-w-lg text-center text-[0.72rem] leading-[1.6] text-orbit-muted">
              {errorMessage}
            </p>
          </div>
        ) : arenaBoards.length === 0 ? (
          <div className="flex h-full items-center justify-center border border-orbit-border bg-orbit-bg px-4 py-6">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted">
              no leaderboard data available
            </p>
          </div>
        ) : (
          <div className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden pb-2 pr-1 snap-x snap-mandatory">
            {arenaBoards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
