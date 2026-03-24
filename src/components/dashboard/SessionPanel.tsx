import type { CSSProperties } from "react";

import type { SessionArenaOverview } from "../../types/dashboard";
import { DashboardPanel } from "./DashboardPanel";
import { card, pill } from "./styles";

type SessionPanelProps = {
  title: string;
  sessionDate: string;
  window: string;
  arenaOverview: SessionArenaOverview | null;
  style?: CSSProperties;
};

function buildCompactSessionLabel(sessionDate: string, windowLabel: string) {
  const compactDate =
    sessionDate.length >= 10
      ? sessionDate.slice(5).replace("-", ".")
      : sessionDate;
  return `${compactDate} / ${windowLabel}`;
}

export function SessionPanel({
  title,
  sessionDate,
  window,
  arenaOverview,
  style,
}: SessionPanelProps) {
  return (
    <DashboardPanel
      eyebrow="Benchmark / Rankings"
      title={arenaOverview?.title ?? title}
      sessionLabel={buildCompactSessionLabel(sessionDate, window)}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
            type leaderboard snapshot
          </p>
          <span className={pill}>
            {arenaOverview?.boards.length ?? 0} boards
          </span>
        </div>

        {arenaOverview && arenaOverview.boards.length > 0 ? (
          <div className="grid min-h-0 flex-1 gap-2 overflow-auto pr-1">
            {arenaOverview.boards.map((board) => (
              <article
                key={board.id}
                className={`${card} min-w-0 space-y-3 bg-orbit-bg`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-accent">
                        {board.label}
                      </p>
                      <span className={pill}>{board.boardName}</span>
                      {board.referenceUrl ? (
                        <a
                          href={board.referenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="orbit-token-ellipsis inline-flex max-w-[12rem] text-[0.62rem] font-mono uppercase tracking-[0.12em] text-orbit-accent-dim underline underline-offset-4 hover:text-orbit-accent"
                        >
                          open board
                        </a>
                      ) : null}
                    </div>
                    {board.topModel.modelName ? (
                      <>
                        <p className="orbit-wrap-anywhere mt-2 font-display text-[0.9rem] font-semibold text-orbit-text">
                          #{board.topModel.rank ?? "-"}{" "}
                          {board.topModel.modelName}
                        </p>
                        <p className="orbit-wrap-anywhere mt-1 text-[0.72rem] leading-[1.5] text-orbit-text">
                          {board.topModel.organization ?? "Unknown org"} ·{" "}
                          {board.scoreLabel ?? "rating"}{" "}
                          {board.topModel.rating ?? "-"} · votes{" "}
                          {board.topModel.votes ?? "-"}
                        </p>
                      </>
                    ) : (
                      <p className="orbit-wrap-anywhere mt-2 text-[0.72rem] leading-[1.55] text-orbit-text">
                        {board.description ?? "상위 모델 정보 없이 snapshot만 수집된 leaderboard입니다."}
                      </p>
                    )}
                    {board.description ? (
                      <p className="orbit-wrap-anywhere mt-2 text-[0.7rem] leading-[1.55] text-orbit-muted">
                        {board.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid shrink-0 gap-1 text-right">
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-muted">
                      models {board.totalModels ?? "-"}
                    </span>
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-muted">
                      votes {board.totalVotes ?? "-"}
                    </span>
                    {board.updatedAt ? (
                      <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-muted">
                        {board.updatedAt.slice(0, 10)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {board.topEntries.length > 0 ? (
                  <div className="grid gap-2">
                    {board.topEntries.slice(0, 5).map((entry) => (
                      <div
                        key={`${board.id}-${entry.rank}-${entry.modelName}`}
                        className="orbit-leaderboard-entry grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 px-2 py-2"
                      >
                        <span className="orbit-leaderboard-entry__rank font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-accent">
                          #{entry.rank ?? "-"}
                        </span>
                        <div className="orbit-leaderboard-entry__body min-w-0">
                          {entry.url ? (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noreferrer"
                              className="orbit-wrap-anywhere text-[0.72rem] leading-[1.45] text-orbit-text underline underline-offset-4 hover:text-orbit-accent"
                            >
                              {entry.modelName ?? "Unknown model"}
                            </a>
                          ) : (
                            <p className="orbit-wrap-anywhere text-[0.72rem] leading-[1.45] text-orbit-text">
                              {entry.modelName ?? "Unknown model"}
                            </p>
                          )}
                          <p className="orbit-wrap-anywhere mt-1 text-[0.66rem] leading-[1.45] text-orbit-muted">
                            {entry.organization ?? "Unknown org"} · rating{" "}
                            {entry.rating ?? "-"} · votes {entry.votes ?? "-"}
                          </p>
                          {(entry.license || entry.contextLength) ? (
                            <p className="orbit-wrap-anywhere mt-1 text-[0.62rem] leading-[1.45] text-orbit-muted">
                              {entry.license ?? "license n/a"} · ctx{" "}
                              {entry.contextLength ?? "-"}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-orbit-border bg-orbit-panel px-3 py-2">
                    <p className="orbit-wrap-anywhere text-[0.7rem] leading-[1.5] text-orbit-muted">
                      추가 랭킹 엔트리가 아직 없습니다.
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className={`${card} border-dashed`}>
            <p className="orbit-wrap-anywhere text-[0.74rem] leading-[1.55] text-orbit-muted">
              LMArena ranking data is not available for this session yet.
            </p>
          </div>
        )}
      </div>
    </DashboardPanel>
  );
}
