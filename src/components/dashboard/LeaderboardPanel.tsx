import { useMemo, type CSSProperties } from "react";

import { buildLeaderboardEntries } from "../../features/dashboard/display";
import type {
  SessionArenaBoard,
  SessionArenaBoardEntry,
} from "../../types/dashboard";

type LeaderboardPanelProps = {
  arenaBoards: readonly SessionArenaBoard[];
  isLoadingLeaderboards: boolean;
  leaderboardError: string | null;
  dashboardError: string | null;
};

const MAX_ENTRIES = 20;

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

function EntryCard({
  entry,
  delayMs = 0,
}: {
  entry: SessionArenaBoardEntry;
  delayMs?: number;
}) {
  return (
    <article
      className="orbit-leaderboard-entry orbit-hacker-reveal"
      style={{ "--hacker-delay": `${delayMs}ms` } as CSSProperties}
    >
      <div className="orbit-hacker-reveal__content flex min-w-0 items-center gap-0">
        <div className="orbit-leaderboard-entry__rank">
          <span className="font-mono text-[0.64rem] font-semibold tabular-nums text-orbit-accent">
            {entry.rank ?? "—"}
          </span>
        </div>

        <div className="orbit-leaderboard-entry__body min-w-0 flex-1 px-2 py-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            {entry.url ? (
              <a
                href={entry.url}
                target="_blank"
                rel="noreferrer"
                className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.68rem] font-semibold leading-snug text-orbit-text hover:text-orbit-accent"
              >
                {entry.modelName ?? "—"}
              </a>
            ) : (
              <h3 className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.68rem] font-semibold leading-snug text-orbit-text">
                {entry.modelName ?? "—"}
              </h3>
            )}
            {entry.organization ? (
              <span className="shrink-0 font-mono text-[0.42rem] uppercase tracking-widest text-orbit-muted">
                {entry.organization}
              </span>
            ) : null}
          </div>
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
    <article className="flex h-full min-h-0 w-[17rem] flex-none snap-start flex-col border border-orbit-border bg-orbit-bg sm:w-[18rem] lg:w-[19rem] xl:w-[20rem]">
      <div className="orbit-leaderboard-board__header px-2.5 py-2">
        <h3 className="orbit-wrap-anywhere font-display text-[0.82rem] font-semibold leading-tight text-orbit-text">
          {resolveBoardTitle(board)}
        </h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {entries.length > 0 ? (
          <div className="grid gap-1">
            {entries.map((entry, index) => (
              <EntryCard
                key={`${board.id}-${entry.rank}-${entry.modelName}`}
                entry={entry}
                delayMs={index * 80}
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
  arenaBoards,
  isLoadingLeaderboards,
  leaderboardError,
  dashboardError,
}: LeaderboardPanelProps) {
  const errorMessage = leaderboardError ?? dashboardError;

  const stats = useMemo(() => {
    let totalModels = 0;
    let totalVotes = 0;
    for (const board of arenaBoards) {
      totalModels += Number(board.totalModels ?? 0) || 0;
      totalVotes += Number(board.totalVotes ?? 0) || 0;
    }
    return { boards: arenaBoards.length, models: totalModels, votes: totalVotes };
  }, [arenaBoards]);

  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel p-3 md:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orbit-border pb-2">
        <h1 className="font-display text-[0.92rem] font-semibold text-orbit-text">
          AI Model Leaderboard
        </h1>
        {stats.boards > 0 ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.48rem] uppercase tracking-[0.12em] text-orbit-muted">
              {stats.boards} boards
            </span>
            <span className="font-mono text-[0.48rem] uppercase tracking-[0.12em] text-orbit-muted">
              {stats.models.toLocaleString()} models
            </span>
            <span className="font-mono text-[0.48rem] uppercase tracking-[0.12em] text-orbit-muted">
              {stats.votes.toLocaleString()} votes
            </span>
          </div>
        ) : null}
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

      <div className="mt-3 min-h-0 flex-1">
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
