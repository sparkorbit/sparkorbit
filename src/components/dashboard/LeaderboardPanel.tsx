import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { buildLeaderboardEntries, formatLeaderboardValue } from "../../features/dashboard/display";
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

const MAX_ENTRIES = 10;

// ─── group classification ────────────────────────────────────────────────────

type GroupKey = "arena" | "capability" | "multimodal";

const GROUP_META: Record<GroupKey, { label: string; sublabel: string }> = {
  arena:      { label: "Arena",      sublabel: "chat battles"        },
  capability: { label: "Capability", sublabel: "task benchmarks"     },
  multimodal: { label: "Multimodal", sublabel: "vision & cross-modal" },
};

function classifyBoard(label: string): GroupKey {
  const l = label.toLowerCase();
  if (/vision|image|video|audio|multimodal/.test(l)) return "multimodal";
  if (/cod|math|reason|hard|instruct|longer|creative|writing/.test(l)) return "capability";
  return "arena";
}

// ─── helpers ────────────────────────────────────────────────────────────────

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ─── entry card ──────────────────────────────────────────────────────────────


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
          {/* rank */}
          <div className="flex w-6 shrink-0 items-center justify-center self-stretch">
            <span className="font-mono text-[0.56rem] tabular-nums text-orbit-muted">
              {entry.rank ?? "—"}
            </span>
          </div>

          {/* body */}
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

// ─── column ──────────────────────────────────────────────────────────────────

function BoardColumn({
  groupKey,
  boards,
  isLoadingLeaderboards,
  errorMessage,
}: {
  groupKey: GroupKey;
  boards: SessionArenaBoard[];
  isLoadingLeaderboards: boolean;
  errorMessage: string | null;
}) {
  const meta = GROUP_META[groupKey];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeBoard =
    (selectedId ? boards.find((b) => b.id === selectedId) : null) ??
    boards[0] ??
    null;

  const entries = useMemo(
    () => buildLeaderboardEntries(activeBoard).slice(0, MAX_ENTRIES),
    [activeBoard],
  );


  return (
    <div className="flex min-w-0 flex-1 flex-col border border-orbit-border bg-orbit-bg">
      {/* column header */}
      <div className="border-b border-orbit-border px-3 py-2">
        <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
          {meta.label}
        </p>
        <p className="mt-0.5 font-mono text-[0.52rem] uppercase tracking-widest text-orbit-muted">
          {meta.sublabel}
        </p>
      </div>

      {/* board tabs */}
      {boards.length > 0 ? (
        <div className="orbit-scrollbar-hidden flex gap-0.5 overflow-x-auto border-b border-orbit-border bg-orbit-panel px-1.5 py-1">
          {boards.map((board) => {
            const isSelected = activeBoard?.id === board.id;
            return (
              <button
                key={board.id}
                type="button"
                className={[
                  "shrink-0 border px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.12em] transition-colors duration-150",
                  isSelected
                    ? "border-orbit-accent bg-orbit-bg text-orbit-accent"
                    : "border-transparent bg-transparent text-orbit-muted hover:border-orbit-border hover:text-orbit-text",
                ].join(" ")}
                onClick={() => setSelectedId(board.id)}
              >
                {board.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* entries */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {isLoadingLeaderboards ? (
          <p className="px-2 py-3 font-mono text-[0.58rem] text-orbit-muted">syncing…</p>
        ) : errorMessage ? (
          <p className="px-2 py-3 text-[0.6rem] text-orbit-muted">{errorMessage}</p>
        ) : boards.length === 0 ? (
          <p className="px-2 py-3 font-mono text-[0.58rem] text-orbit-muted">no boards</p>
        ) : entries.length === 0 ? (
          <p className="px-2 py-3 font-mono text-[0.58rem] text-orbit-muted">no entries</p>
        ) : (
          <div className="grid gap-1">
            {entries.map((entry, index) => (
              <EntryCard
                key={`${activeBoard?.id}-${entry.rank}-${entry.modelName}`}
                entry={entry}
                delayMs={index * 45}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main panel ─────────────────────────────────────────────────────────────

export function LeaderboardPanel({
  sessionLabel,
  isReloading,
  onReload,
  resolvedArenaOverview,
  arenaBoards,
  isLoadingLeaderboards,
  leaderboardError,
  dashboardError,
}: LeaderboardPanelProps) {
  const errorMessage = leaderboardError ?? dashboardError;

  const groups = useMemo<Record<GroupKey, SessionArenaBoard[]>>(() => {
    const result: Record<GroupKey, SessionArenaBoard[]> = {
      arena: [],
      capability: [],
      multimodal: [],
    };
    for (const board of arenaBoards) {
      result[classifyBoard(board.label)].push(board);
    }
    return result;
  }, [arenaBoards]);

  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel p-4 md:p-5">
      {/* panel header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
            Core Node
          </p>
          <h1 className="orbit-wrap-anywhere mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.32rem]">
            Command Grid
          </h1>
          {resolvedArenaOverview?.title ? (
            <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-orbit-muted">
              {resolvedArenaOverview.title}
              {arenaBoards.length > 0 ? ` · ${arenaBoards.length} boards` : ""}
            </p>
          ) : null}
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

      {/* 3-column grid */}
      <div className="mt-4 flex min-h-0 flex-1 gap-2">
        {(["arena", "capability", "multimodal"] as GroupKey[]).map((key) => (
          <BoardColumn
            key={key}
            groupKey={key}
            boards={groups[key]}
            isLoadingLeaderboards={isLoadingLeaderboards}
            errorMessage={errorMessage}
          />
        ))}
      </div>
    </section>
  );
}
