import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  buildLeaderboardEntries,
  compactText,
  formatDisplayDate,
  formatLeaderboardValue,
} from "../../features/dashboard/display";
import type {
  SessionArenaBoard,
  SessionArenaBoardEntry,
} from "../../types/dashboard";

type LeaderboardPanelProps = {
  sessionLabel: string;
  isReloading: boolean;
  onReload: () => void;
  arenaBoards: readonly SessionArenaBoard[];
  isLoadingLeaderboards: boolean;
  leaderboardError: string | null;
  dashboardError: string | null;
};

const MAX_VISIBLE_BOARDS = 6;
const MAX_ENTRIES = 6;

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

function resolveBoardSubtitle(board: SessionArenaBoard) {
  const pieces = [
    board.scoreLabel?.trim() || null,
    compactText(board.description, 72) || null,
  ].filter((value): value is string => Boolean(value));

  return pieces.join(" · ");
}

function EntryCard({
  entry,
  delayMs = 0,
}: {
  entry: SessionArenaBoardEntry;
  delayMs?: number;
}) {
  const rating = toFiniteNumber(entry.rating);

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
            {rating != null ? (
              <span className="shrink-0 font-mono text-[0.58rem] tabular-nums text-orbit-accent">
                {formatLeaderboardValue(rating)}
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
  const subtitle = resolveBoardSubtitle(board);
  const updatedAt = formatDisplayDate(board.updatedAt);
  const totalModels = formatLeaderboardValue(board.totalModels);
  const totalVotes = formatLeaderboardValue(board.totalVotes);

  return (
    <article className="flex min-h-0 flex-col border border-orbit-border bg-orbit-bg">
      <div className="border-b border-orbit-border px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-orbit-accent">
              benchmark
            </p>
            <h3 className="orbit-wrap-anywhere mt-1.5 font-display text-[0.88rem] font-semibold text-orbit-text">
              {resolveBoardTitle(board)}
            </h3>
            {subtitle ? (
              <p className="orbit-wrap-anywhere mt-1 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-muted">
                {subtitle}
              </p>
            ) : null}
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orbit-border px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {updatedAt ? (
            <span className="font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
              {updatedAt}
            </span>
          ) : null}
          {totalModels !== "-" ? (
            <span className="font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
              <span className="text-orbit-text">{totalModels}</span> models
            </span>
          ) : null}
        </div>
        {totalVotes !== "-" ? (
          <span className="font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
            <span className="text-orbit-text">{totalVotes}</span> votes
          </span>
        ) : null}
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
            no entries
          </p>
        )}
      </div>
    </article>
  );
}

export function LeaderboardPanel({
  sessionLabel,
  isReloading,
  onReload,
  arenaBoards,
  isLoadingLeaderboards,
  leaderboardError,
  dashboardError,
}: LeaderboardPanelProps) {
  const errorMessage = leaderboardError ?? dashboardError;
  const [pageIndex, setPageIndex] = useState(0);
  const totalPages = Math.max(1, Math.ceil(arenaBoards.length / MAX_VISIBLE_BOARDS));

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  const visibleStart = pageIndex * MAX_VISIBLE_BOARDS;
  const visibleBoards = useMemo(
    () => arenaBoards.slice(visibleStart, visibleStart + MAX_VISIBLE_BOARDS),
    [arenaBoards, visibleStart],
  );
  const visibleEnd = visibleBoards.length > 0 ? visibleStart + visibleBoards.length : 0;
  const headerSummary =
    arenaBoards.length > 0
      ? `showing ${visibleStart + 1}-${visibleEnd} of ${arenaBoards.length} boards`
      : "no boards";

  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
            Benchmark Grid
          </p>
          <h1 className="orbit-wrap-anywhere mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.32rem]">
            Live AI Benchmarks
          </h1>
          <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-orbit-muted">
            {headerSummary}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="border border-orbit-border bg-orbit-panel px-2.5 py-1.5 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pageIndex === 0 || arenaBoards.length <= MAX_VISIBLE_BOARDS}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              left
            </button>
            <button
              type="button"
              className="border border-orbit-border bg-orbit-panel px-2.5 py-1.5 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                pageIndex >= totalPages - 1 || arenaBoards.length <= MAX_VISIBLE_BOARDS
              }
              onClick={() =>
                setPageIndex((current) => Math.min(totalPages - 1, current + 1))
              }
            >
              right
            </button>
          </div>

          <span className="orbit-token-ellipsis inline-flex max-w-[16rem] border border-orbit-border-strong bg-orbit-bg px-2 py-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-orbit-text">
            {sessionLabel}
          </span>
          <button
            type="button"
            className="border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isReloading}
            onClick={onReload}
          >
            {isReloading ? "refreshing" : "refresh"}
          </button>
        </div>
      </div>

      {isLoadingLeaderboards ? (
        <div className="mt-3">
          <p className="font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted">
            syncing benchmark boards…
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
        ) : visibleBoards.length === 0 ? (
          <div className="flex h-full items-center justify-center border border-orbit-border bg-orbit-bg px-4 py-6">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted">
              no benchmark boards
            </p>
          </div>
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2">
            {visibleBoards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
