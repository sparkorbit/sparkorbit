import { formatLeaderboardValue } from "../../features/dashboard/display";
import { HackerRevealCard } from "../../features/dashboard/detailPanels";
import type {
  SessionArenaBoard,
  SessionArenaBoardEntry,
  SessionArenaOverview,
} from "../../types/dashboard";

type LeaderboardPanelProps = {
  sessionLabel: string;
  isReloading: boolean;
  onReload: () => void;
  resolvedArenaOverview: SessionArenaOverview | null;
  selectedArenaBoard: SessionArenaBoard | null;
  arenaBoards: readonly SessionArenaBoard[];
  leaderboardEntries: SessionArenaBoardEntry[];
  isLoadingLeaderboards: boolean;
  leaderboardError: string | null;
  dashboardError: string | null;
  onSelectBoard: (boardId: string) => void;
};

export function LeaderboardPanel({
  sessionLabel,
  isReloading,
  onReload,
  resolvedArenaOverview,
  selectedArenaBoard,
  arenaBoards,
  leaderboardEntries,
  isLoadingLeaderboards,
  leaderboardError,
  dashboardError,
  onSelectBoard,
}: LeaderboardPanelProps) {
  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
            Core Node
          </p>
          <h1 className="orbit-wrap-anywhere mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.32rem]">
            Command Grid
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="orbit-token-ellipsis inline-flex max-w-[16rem] border border-orbit-border-strong bg-orbit-bg px-2 py-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-orbit-text">
            {sessionLabel}
          </span>
          <button
            type="button"
            className="border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isReloading}
            onClick={onReload}
          >
            {isReloading ? "probing" : "rerun probe"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col border border-orbit-border bg-orbit-bg p-4">
        <div className="border-b border-orbit-border pb-3">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
            Rank Board
          </p>
          <h2 className="orbit-wrap-anywhere mt-2 font-display text-[1rem] font-semibold text-orbit-text md:text-[1.16rem]">
            {selectedArenaBoard?.boardName ??
              resolvedArenaOverview?.title ??
              "Live Rankings"}
          </h2>
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto border border-orbit-border bg-orbit-panel p-1">
          {arenaBoards.map((board) => {
            const isSelected = selectedArenaBoard?.id === board.id;
            return (
              <button
                key={board.id}
                type="button"
                className={[
                  "shrink-0 border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] transition-colors duration-150",
                  isSelected
                    ? "border-orbit-accent bg-orbit-bg text-orbit-accent"
                    : "border-transparent bg-transparent text-orbit-muted hover:border-orbit-border hover:text-orbit-text",
                ].join(" ")}
                onClick={() => onSelectBoard(board.id)}
              >
                {board.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoadingLeaderboards ? (
            <div className="border border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.6] text-orbit-text">
                rank feed를 동기화하는 중입니다.
              </p>
            </div>
          ) : leaderboardError ? (
            <div className="border border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.6] text-orbit-text">
                {leaderboardError}
              </p>
            </div>
          ) : dashboardError ? (
            <div className="border border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.6] text-orbit-text">
                {dashboardError}
              </p>
            </div>
          ) : selectedArenaBoard ? (
            <div className="grid gap-2">
              {leaderboardEntries.map((entry, index) => (
                <HackerRevealCard
                  key={`${selectedArenaBoard.id}-${entry.rank}-${entry.modelName}`}
                  delayMs={index * 70}
                >
                  <article className="orbit-leaderboard-entry grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 p-3">
                    <div className="orbit-leaderboard-entry__rank flex h-10 min-w-10 items-center justify-center px-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-orbit-accent">
                      #{entry.rank ?? "-"}
                    </div>
                    <div className="orbit-leaderboard-entry__body min-w-0">
                      {entry.url ? (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="orbit-wrap-anywhere font-display text-[0.9rem] font-semibold leading-[1.45] text-orbit-text underline underline-offset-4 hover:text-orbit-accent"
                        >
                          {entry.modelName ?? "-"}
                        </a>
                      ) : (
                        <h3 className="orbit-wrap-anywhere font-display text-[0.9rem] font-semibold leading-[1.45] text-orbit-text">
                          {entry.modelName ?? "-"}
                        </h3>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.organization ? (
                          <span className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-text">
                            {entry.organization}
                          </span>
                        ) : null}
                        {entry.rating != null ? (
                          <span className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-text">
                            {selectedArenaBoard.scoreLabel
                              ? `${selectedArenaBoard.scoreLabel} ${formatLeaderboardValue(entry.rating)}`
                              : formatLeaderboardValue(entry.rating)}
                          </span>
                        ) : null}
                        {entry.votes != null ? (
                          <span className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-text">
                            votes {formatLeaderboardValue(entry.votes)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </HackerRevealCard>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-orbit-border bg-orbit-panel px-4 py-4">
              <p className="orbit-wrap-anywhere text-[0.74rem] leading-[1.6] text-orbit-muted">
                아직 띄울 rank feed가 없습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
