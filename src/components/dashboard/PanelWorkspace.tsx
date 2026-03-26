import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PANEL_WORKSPACE_STORAGE } from "./panelWorkspaceStorage";

const COL_STEP_PX = 180;
const MIN_COLUMN_WIDTH_PX = 360;
const DEFAULT_MAX_DYNAMIC_COLUMNS = 6;
const MAX_COL_SPAN = 6;
const DEFAULT_GRID_ROW_HEIGHT_PX = 320;
const MIN_ROW_SPAN = 1;
const DEFAULT_ROW_SPAN = 1;
const DEFAULT_COL_SPAN = 1;
const MAX_ROW_SPAN = 8;
const WINDOW_BAR_HEIGHT_PX = 28;

type PanelWorkspaceItem = {
  id: string;
  label?: string;
  title?: string;
  meta?: string;
  detail?: string;
  accentColor?: string;
  node: ReactNode;
  defaultRowSpan?: number;
  defaultColSpan?: number;
};

type PanelSize = {
  rowSpan: number;
  colSpan: number;
};

type PanelWorkspaceProps = {
  mainPanel?: ReactNode;
  summaryPanel?: ReactNode;
  infoPanelOverride?: {
    title: string;
    node: ReactNode;
  };
  infoItems: PanelWorkspaceItem[];
  unassignedItems?: PanelWorkspaceItem[];
  rowHeightPx?: number;
};

type PanelBoardProps = {
  items: PanelWorkspaceItem[];
  orderStorageKey: string;
  sizeStorageKey: string;
  emptyTitle: string;
  emptyDescription: string;
  maxDynamicColumns?: number;
  minColumnWidthPx?: number;
  allowColumnResize?: boolean;
  allowRowResize?: boolean;
  rowHeightPx?: number;
  onRemoveItem?: (itemId: string) => void;
};

type PanelPlacement = {
  id: string;
  colStart: number;
  rowStart: number;
  colSpan: number;
  rowSpan: number;
};

type DragState = {
  id: string;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseTaggedPanelTitle(title: string | undefined, label?: string) {
  const resolvedTitle = String(title ?? "").trim();
  const resolvedLabel = String(label ?? "").trim();
  const tagMatch = resolvedTitle.match(/^\[([^\]]+)\]\s*(.*)$/);

  if (tagMatch) {
    return {
      tag: `[${tagMatch[1].trim()}]`,
      title: tagMatch[2].trim(),
    };
  }

  return {
    tag: resolvedLabel ? `[${resolvedLabel}]` : "",
    title: resolvedTitle,
  };
}

function parseTrackSize(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function swapItems(order: string[], activeId: string, targetId: string) {
  const next = [...order];
  const fromIndex = next.indexOf(activeId);
  const toIndex = next.indexOf(targetId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return order;
  }

  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
  return next;
}

function moveItemBefore(order: string[], activeId: string, targetId: string) {
  if (activeId === targetId) {
    return order;
  }

  const next = order.filter((id) => id !== activeId);
  const targetIndex = next.indexOf(targetId);

  if (targetIndex === -1) {
    return order;
  }

  next.splice(targetIndex, 0, activeId);
  return next;
}

function loadOrder(ids: string[], storageKey: string) {
  if (typeof window === "undefined") {
    return ids;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return ids;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return ids;
    }

    const valid = parsed.filter((value): value is string =>
      ids.includes(value),
    );
    const missing = ids.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return ids;
  }
}

function loadIdList(ids: string[], storageKey: string) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => ids.includes(value));
  } catch {
    return [];
  }
}

function loadSizes(items: PanelWorkspaceItem[], storageKey: string) {
  const defaults = Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        rowSpan: item.defaultRowSpan ?? DEFAULT_ROW_SPAN,
        colSpan: item.defaultColSpan ?? DEFAULT_COL_SPAN,
      },
    ]),
  ) as Record<string, PanelSize>;

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Record<string, Partial<PanelSize>>;

    return Object.fromEntries(
      items.map((item) => {
        const saved = parsed[item.id];
        const fallback = defaults[item.id];

        return [
          item.id,
          {
            rowSpan: clamp(
              Number(saved?.rowSpan ?? fallback.rowSpan),
              MIN_ROW_SPAN,
              MAX_ROW_SPAN,
            ),
            colSpan: clamp(
              Number(saved?.colSpan ?? fallback.colSpan),
              1,
              MAX_COL_SPAN,
            ),
          },
        ];
      }),
    ) as Record<string, PanelSize>;
  } catch {
    return defaults;
  }
}

function canPlaceItem(
  occupancy: boolean[][],
  rowStart: number,
  colStart: number,
  rowSpan: number,
  colSpan: number,
  columnCount: number,
) {
  if (colStart + colSpan - 1 > columnCount) {
    return false;
  }

  for (let row = rowStart; row < rowStart + rowSpan; row += 1) {
    const rowCells = occupancy[row] ?? [];

    for (let col = colStart; col < colStart + colSpan; col += 1) {
      if (rowCells[col]) {
        return false;
      }
    }
  }

  return true;
}

function occupyCells(
  occupancy: boolean[][],
  rowStart: number,
  colStart: number,
  rowSpan: number,
  colSpan: number,
) {
  for (let row = rowStart; row < rowStart + rowSpan; row += 1) {
    if (!occupancy[row]) {
      occupancy[row] = [];
    }

    for (let col = colStart; col < colStart + colSpan; col += 1) {
      occupancy[row]![col] = true;
    }
  }
}

function computePlacements(
  orderedItems: PanelWorkspaceItem[],
  sizes: Record<string, PanelSize>,
  columnCount: number,
) {
  const occupancy: boolean[][] = [];
  const placements = new Map<string, PanelPlacement>();

  for (const item of orderedItems) {
    const size = sizes[item.id] ?? {
      rowSpan: item.defaultRowSpan ?? DEFAULT_ROW_SPAN,
      colSpan: item.defaultColSpan ?? DEFAULT_COL_SPAN,
    };
    const colSpan = clamp(size.colSpan, 1, columnCount);
    const rowSpan = clamp(size.rowSpan, MIN_ROW_SPAN, MAX_ROW_SPAN);

    let placed = false;
    let rowStart = 1;

    while (!placed) {
      for (let colStart = 1; colStart <= columnCount; colStart += 1) {
        if (
          canPlaceItem(
            occupancy,
            rowStart,
            colStart,
            rowSpan,
            colSpan,
            columnCount,
          )
        ) {
          occupyCells(occupancy, rowStart, colStart, rowSpan, colSpan);
          placements.set(item.id, {
            id: item.id,
            colStart,
            rowStart,
            colSpan,
            rowSpan,
          });
          placed = true;
          break;
        }
      }

      rowStart += 1;
    }
  }

  return placements;
}

function EmptyBoardState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-orbit-bg p-4">
      <div className="max-w-sm border border-orbit-border bg-orbit-bg-elevated p-4 text-center">
        <p className="font-mono text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
          {title}
        </p>
        <p className="mt-2 text-[0.74rem] leading-[1.55] text-orbit-muted">
          {description}
        </p>
      </div>
    </div>
  );
}

function InfoPanelVisibilityModal({
  isOpen,
  items,
  hiddenItemIds,
  orderedItemIds,
  onClose,
  onToggleItem,
  onReorderItem,
  onShowGroup,
  onHideGroup,
  onShowOnlyGroup,
  onShowAll,
  onHideAll,
  onApply,
}: {
  isOpen: boolean;
  items: PanelWorkspaceItem[];
  hiddenItemIds: string[];
  orderedItemIds: string[];
  onClose: () => void;
  onToggleItem: (itemId: string) => void;
  onReorderItem: (activeId: string, targetId: string) => void;
  onShowGroup: (groupLabel: string) => void;
  onHideGroup: (groupLabel: string) => void;
  onShowOnlyGroup: (groupLabel: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onApply: () => void;
}) {
  const hiddenItemIdSet = new Set(hiddenItemIds);
  const visibleCount = items.length - hiddenItemIds.length;
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const orderedItems = useMemo(() => {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const ordered = orderedItemIds
      .map((itemId) => itemMap.get(itemId))
      .filter((item): item is PanelWorkspaceItem => item != null);
    const missing = items.filter(
      (item) => !orderedItemIds.includes(item.id),
    );
    return [...ordered, ...missing];
  }, [items, orderedItemIds]);
  const groupedItems = useMemo(() => {
    const groups = new Map<string, PanelWorkspaceItem[]>();

    for (const item of orderedItems) {
      const groupLabel = item.label?.trim() || "Other";
      const existing = groups.get(groupLabel);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(groupLabel, [item]);
      }
    }

    return Array.from(groups.entries()).map(([label, grouped]) => ({
      label,
      accentColor: grouped.find((item) => item.accentColor)?.accentColor,
      items: grouped,
    }));
  }, [orderedItems]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setDraggedItemId(null);
      setDropTargetId(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-orbit-bg/82 p-3 md:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(680px,92vh)] w-full max-w-xl flex-col overflow-hidden border border-orbit-border-strong bg-orbit-bg-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="orbit-grid pointer-events-none absolute inset-0 opacity-20"
        />
        <div
          aria-hidden="true"
          className="orbit-scanlines pointer-events-none absolute inset-0 opacity-20"
        />

        <div className="relative z-10 border-b border-orbit-border-strong bg-orbit-bg px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-orbit-accent">
                manage panels
              </p>
              <h2 className="mt-1.5 font-display text-[0.9rem] font-semibold text-orbit-text">
                Manage Source Panels
              </h2>
              <p className="mt-1.5 text-[0.68rem] leading-[1.45] text-orbit-muted">
                Drag to change priority, click to show or hide, then apply.
              </p>
            </div>

            <button
              type="button"
              className="shrink-0 border border-orbit-border bg-orbit-panel px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
              onClick={onClose}
            >
              close
            </button>
          </div>
        </div>

        <div className="orbit-scrollbar-hidden relative z-10 min-h-0 flex-1 overflow-auto p-2.5">
          {items.length === 0 ? (
            <div className="flex min-h-[180px] items-center justify-center border border-orbit-border bg-orbit-bg p-4 text-center">
              <div className="max-w-sm">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  no source panels
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  No source panels available.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <section className="border border-orbit-border bg-orbit-bg p-2">
                <p className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-orbit-accent">
                  quick groups
                </p>
                <p className="mt-1 text-[0.7rem] leading-[1.45] text-orbit-muted">
                  Focus on one category or reopen one group at once.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {groupedItems.map((group) => {
                    const groupAccent =
                      group.accentColor || "var(--color-orbit-accent-dim)";

                    return (
                      <button
                        key={group.label}
                        type="button"
                        className={[
                          "border px-2 py-1 font-mono text-[0.54rem] font-semibold uppercase tracking-[0.12em] transition-colors duration-150",
                          "hover:brightness-110",
                        ].join(" ")}
                        style={{
                          borderColor: `color-mix(in srgb, ${groupAccent} 38%, var(--color-orbit-border))`,
                          backgroundColor: `color-mix(in srgb, ${groupAccent} 12%, var(--color-orbit-panel))`,
                          color: groupAccent,
                        }}
                        onClick={() => onShowOnlyGroup(group.label)}
                      >
                        {group.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="border border-orbit-border bg-orbit-bg p-2">
                <p className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-orbit-accent">
                  priority
                </p>
                <p className="mt-1 text-[0.7rem] leading-[1.45] text-orbit-muted">
                  Drag the handle on each panel card to control which source shows first.
                </p>
              </section>

              {groupedItems.map((group) => {
                const hiddenCount = group.items.filter((item) =>
                  hiddenItemIdSet.has(item.id),
                ).length;
                const visibleGroupCount = group.items.length - hiddenCount;
                const groupAccent =
                  group.accentColor || "var(--color-orbit-accent-dim)";

                return (
                  <section
                    key={group.label}
                    className="border border-orbit-border bg-orbit-bg"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${groupAccent} 3%, var(--color-orbit-bg))`,
                    }}
                  >
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-orbit-border px-2.5 py-2"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${groupAccent} 7%, var(--color-orbit-bg))`,
                      }}
                    >
                      <div className="min-w-0">
                        <span
                          className="inline-flex items-center border px-2 py-0.5 font-mono text-[0.56rem] font-semibold uppercase tracking-[0.14em]"
                          style={{
                            borderColor: `color-mix(in srgb, ${groupAccent} 55%, var(--color-orbit-border))`,
                            backgroundColor: `color-mix(in srgb, ${groupAccent} 12%, var(--color-orbit-bg))`,
                            color: groupAccent,
                          }}
                        >
                          {group.label}
                        </span>
                        <p className="mt-1 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-muted">
                          {visibleGroupCount}/{group.items.length} visible
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                          onClick={() => onShowGroup(group.label)}
                        >
                          show
                        </button>
                        <button
                          type="button"
                          className="border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                          onClick={() => onHideGroup(group.label)}
                        >
                          hide
                        </button>
                        <button
                          type="button"
                          className="border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                          onClick={() => onShowOnlyGroup(group.label)}
                        >
                          only
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-1 p-2 sm:grid-cols-2">
                      {group.items.map((item) => {
                        const resolvedTitle = item.title ?? item.label ?? item.id;
                        const parsedTitle = parseTaggedPanelTitle(
                          typeof resolvedTitle === "string"
                            ? resolvedTitle
                            : String(resolvedTitle),
                          item.label,
                        );
                        const displayTitle =
                          parsedTitle.title || resolvedTitle;
                        const isHidden = hiddenItemIdSet.has(item.id);

                        return (
                          <article
                            key={item.id}
                            className={[
                              "group min-w-0 border p-2 transition-colors duration-150",
                              dropTargetId === item.id && draggedItemId !== item.id
                                ? "border-orbit-accent"
                                : "",
                              isHidden
                                ? "border-orbit-border bg-orbit-bg hover:border-orbit-accent/70 hover:bg-orbit-bg-elevated"
                                : "border-orbit-accent/70 bg-orbit-panel",
                            ].join(" ")}
                            onDragOver={(event) => {
                              event.preventDefault();
                              if (draggedItemId && draggedItemId !== item.id) {
                                setDropTargetId(item.id);
                              }
                            }}
                            onDragLeave={() => {
                              if (dropTargetId === item.id) {
                                setDropTargetId(null);
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (draggedItemId && draggedItemId !== item.id) {
                                onReorderItem(draggedItemId, item.id);
                              }
                              setDraggedItemId(null);
                              setDropTargetId(null);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                draggable
                                className={[
                                  "mt-0.5 shrink-0 border px-1.5 py-1 font-mono text-[0.48rem] uppercase tracking-[0.16em] transition-colors duration-150",
                                  draggedItemId === item.id
                                    ? "border-orbit-accent text-orbit-accent"
                                    : "border-orbit-border text-orbit-muted hover:border-orbit-accent hover:text-orbit-accent",
                                ].join(" ")}
                                title="Drag to change priority"
                                aria-label={`Drag to reorder ${displayTitle}`}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", item.id);
                                  setDraggedItemId(item.id);
                                  setDropTargetId(item.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedItemId(null);
                                  setDropTargetId(null);
                                }}
                              >
                                drag
                              </button>

                              <button
                                type="button"
                                aria-pressed={!isHidden}
                                className="min-w-0 flex-1 text-left"
                                onClick={() => onToggleItem(item.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-mono text-[0.48rem] uppercase tracking-[0.14em] text-orbit-muted">
                                      priority {orderedItemIds.indexOf(item.id) + 1}
                                    </p>
                                    <h4 className="orbit-wrap-anywhere mt-1 min-w-0 font-display text-[0.76rem] font-semibold leading-[1.32] text-orbit-text">
                                      {displayTitle}
                                    </h4>
                                  </div>
                                  {item.meta ? (
                                    <span className="shrink-0 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-orbit-muted">
                                      {item.meta}
                                    </span>
                                  ) : null}
                                </div>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative z-10 border-t border-orbit-border-strong bg-orbit-bg px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted">
              {visibleCount}/{items.length} visible
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="border border-orbit-border bg-orbit-panel px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                onClick={onShowAll}
              >
                show all
              </button>
              <button
                type="button"
                className="border border-orbit-border bg-orbit-panel px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                onClick={onHideAll}
              >
                hide all
              </button>
              <button
                type="button"
                className="border border-orbit-border bg-orbit-panel px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-border-strong hover:text-orbit-text"
                onClick={onClose}
              >
                cancel
              </button>
              <button
                type="button"
                className="border border-orbit-accent bg-orbit-panel px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg"
                onClick={onApply}
              >
                apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelBoard({
  items,
  orderStorageKey,
  sizeStorageKey,
  emptyTitle,
  emptyDescription,
  maxDynamicColumns = DEFAULT_MAX_DYNAMIC_COLUMNS,
  minColumnWidthPx = MIN_COLUMN_WIDTH_PX,
  allowColumnResize = true,
  allowRowResize = true,
  rowHeightPx = DEFAULT_GRID_ROW_HEIGHT_PX,
  onRemoveItem,
}: PanelBoardProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const swapTargetIdRef = useRef<string | null>(null);
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const [order, setOrder] = useState(() => loadOrder(ids, orderStorageKey));
  const [sizes, setSizes] = useState(() => loadSizes(items, sizeStorageKey));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [columnCount, setColumnCount] = useState(1);
  const [rowStepPx, setRowStepPx] = useState(rowHeightPx);

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) {
      return;
    }

    const syncGridMetrics = () => {
      const styles = window.getComputedStyle(grid);
      const autoRow = parseTrackSize(styles.gridAutoRows);
      const columnGap = parseTrackSize(styles.columnGap);
      const rowGap = parseTrackSize(styles.rowGap);
      const maxColumnCount = Math.max(
        1,
        Math.min(items.length || 1, maxDynamicColumns),
      );
      const nextColumnCount = clamp(
        Math.floor(
          (grid.clientWidth + columnGap) / (minColumnWidthPx + columnGap),
        ),
        1,
        maxColumnCount,
      );

      setColumnCount(nextColumnCount);

      if (autoRow > 0) {
        setRowStepPx(autoRow + rowGap);
      }
    };

    syncGridMetrics();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncGridMetrics)
        : null;

    resizeObserver?.observe(grid);
    window.addEventListener("resize", syncGridMetrics);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncGridMetrics);
    };
  }, [items.length, maxDynamicColumns, minColumnWidthPx, rowHeightPx]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  const syncedOrder = useMemo(() => {
    const valid = order.filter((id) => ids.includes(id));
    const missing = ids.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  }, [ids, order]);

  const syncedSizes = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [
          item.id,
          sizes[item.id] ?? {
            rowSpan: item.defaultRowSpan ?? DEFAULT_ROW_SPAN,
            colSpan: item.defaultColSpan ?? DEFAULT_COL_SPAN,
          },
        ]),
      ) as Record<string, PanelSize>,
    [items, sizes],
  );

  useEffect(() => {
    window.localStorage.setItem(orderStorageKey, JSON.stringify(syncedOrder));
  }, [orderStorageKey, syncedOrder]);

  useEffect(() => {
    window.localStorage.setItem(sizeStorageKey, JSON.stringify(syncedSizes));
  }, [sizeStorageKey, syncedSizes]);

  useEffect(() => {
    if (dragState == null) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragState]);

  const orderedItems = syncedOrder
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is PanelWorkspaceItem => Boolean(item));
  const placements = useMemo(
    () => computePlacements(orderedItems, syncedSizes, columnCount),
    [columnCount, orderedItems, syncedSizes],
  );
  const activeDragId = dragState?.id ?? null;
  const draggedItem = activeDragId
    ? (orderedItems.find((item) => item.id === activeDragId) ?? null)
    : null;

  function updateSwapTarget(nextTargetId: string | null) {
    swapTargetIdRef.current = nextTargetId;
    setSwapTargetId(nextTargetId);
  }

  function beginPanelDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    itemId: string,
  ) {
    if (event.button !== 0) {
      return;
    }

    const panelElement = event.currentTarget.closest("[data-panel-item-id]");

    if (!(panelElement instanceof HTMLElement)) {
      return;
    }

    dragCleanupRef.current?.();
    event.preventDefault();

    const rect = panelElement.getBoundingClientRect();
    const cleanupListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      dragCleanupRef.current = null;
    };

    const finishDrag = (commitSwap: boolean) => {
      const nextTargetId = commitSwap ? swapTargetIdRef.current : null;

      cleanupListeners();
      setDragState(null);
      updateSwapTarget(null);

      if (commitSwap && nextTargetId && nextTargetId !== itemId) {
        setOrder((current) => swapItems(current, itemId, nextTargetId));
      }
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      setDragState((current) =>
        current?.id === itemId
          ? {
              ...current,
              pointerX: moveEvent.clientX,
              pointerY: moveEvent.clientY,
            }
          : current,
      );

      const hoverElement = document.elementFromPoint(
        moveEvent.clientX,
        moveEvent.clientY,
      );
      const hoveredPanel = hoverElement?.closest("[data-panel-item-id]");
      const hoveredId =
        hoveredPanel instanceof HTMLElement
          ? (hoveredPanel.dataset.panelItemId ?? null)
          : null;

      updateSwapTarget(hoveredId && hoveredId !== itemId ? hoveredId : null);
    };

    const onPointerUp = () => finishDrag(true);
    const onCancel = () => finishDrag(false);
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") {
        finishDrag(false);
      }
    };

    dragCleanupRef.current = cleanupListeners;
    setDragState({
      id: itemId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
    updateSwapTarget(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", onCancel);
    window.addEventListener("keydown", onKeyDown);
  }

  if (items.length === 0) {
    return (
      <EmptyBoardState title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="orbit-scrollbar-hidden h-full overflow-auto bg-orbit-bg p-1">
      {orderedItems.length > 0 ? (
        <div
          ref={gridRef}
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            gridAutoRows: `${rowHeightPx}px`,
          }}
        >
          {orderedItems.map((item) => {
            const size = syncedSizes[item.id] ?? {
              rowSpan: item.defaultRowSpan ?? DEFAULT_ROW_SPAN,
              colSpan: item.defaultColSpan ?? DEFAULT_COL_SPAN,
            };
            const resolvedTitle = item.title ?? item.label ?? item.id;
            const parsedTitle = parseTaggedPanelTitle(
              typeof resolvedTitle === "string"
                ? resolvedTitle
                : String(resolvedTitle),
              item.label,
            );
            const displayTitle =
              parsedTitle.title || (!parsedTitle.tag ? resolvedTitle : "");
            const placement = placements.get(item.id);
            const resolvedColSpan =
              placement?.colSpan ?? clamp(size.colSpan, 1, columnCount);
            const resolvedRowSpan = placement?.rowSpan ?? size.rowSpan;
            const colStart = placement?.colStart ?? 1;
            const rowStart = placement?.rowStart ?? 1;

            return (
              <div
                key={item.id}
                data-panel-item-id={item.id}
                className={[
                  "group relative min-h-0 min-w-0 overflow-visible transition-colors duration-150",
                  activeDragId === item.id ? "z-30" : "",
                ].join(" ")}
                style={{
                  gridColumn: `${colStart} / span ${resolvedColSpan}`,
                  gridRow: `${rowStart} / span ${resolvedRowSpan}`,
                }}
              >
                <div
                  className={[
                    "h-full min-h-0 border transition-colors duration-150",
                    swapTargetId === item.id
                      ? "border-orbit-accent"
                      : "border-orbit-border group-hover:border-orbit-border-strong",
                    activeDragId === item.id ? "opacity-25" : "",
                  ].join(" ")}
                  style={{
                    backgroundColor: item.accentColor
                      ? `color-mix(in srgb, ${item.accentColor} 4%, var(--color-orbit-bg-elevated))`
                      : "var(--color-orbit-bg-elevated)",
                  }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div
                      className={[
                        "flex h-10 min-w-0 items-stretch justify-between border-b transition-colors duration-150",
                        activeDragId === item.id || swapTargetId === item.id
                          ? "border-orbit-accent"
                          : "border-orbit-border group-hover:border-orbit-border-strong",
                      ].join(" ")}
                      style={{
                        backgroundColor: item.accentColor
                          ? `color-mix(in srgb, ${item.accentColor} 18%, var(--color-orbit-bg))`
                          : "var(--color-orbit-bg)",
                      }}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 touch-none items-center justify-between px-3 text-left"
                        onPointerDown={(event) =>
                          beginPanelDrag(event, item.id)
                        }
                        title="Drag to reorder"
                      >
                        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                          {parsedTitle.tag ? (
                            <span
                              className="shrink-0 border px-2 py-1 font-mono text-[0.52rem] font-semibold uppercase tracking-[0.14em]"
                              style={{
                                borderColor:
                                  activeDragId === item.id ||
                                  swapTargetId === item.id
                                    ? "var(--color-orbit-accent)"
                                    : item.accentColor
                                      ? `color-mix(in srgb, ${item.accentColor} 55%, var(--color-orbit-border))`
                                      : "var(--color-orbit-border)",
                                backgroundColor:
                                  activeDragId === item.id ||
                                  swapTargetId === item.id
                                    ? "color-mix(in srgb, var(--color-orbit-accent) 12%, var(--color-orbit-bg))"
                                    : item.accentColor
                                      ? `color-mix(in srgb, ${item.accentColor} 12%, var(--color-orbit-bg))`
                                      : "var(--color-orbit-bg)",
                                color:
                                  activeDragId === item.id ||
                                  swapTargetId === item.id
                                    ? "var(--color-orbit-accent)"
                                    : item.accentColor ||
                                      "var(--color-orbit-accent-dim)",
                              }}
                            >
                              {parsedTitle.tag}
                            </span>
                          ) : null}
                          {displayTitle ? (
                            <span
                              className={[
                                "orbit-token-ellipsis font-display text-[0.88rem] font-semibold tracking-[-0.01em]",
                                activeDragId === item.id ||
                                swapTargetId === item.id
                                  ? "text-orbit-accent"
                                  : "text-orbit-text",
                              ].join(" ")}
                            >
                              {displayTitle}
                            </span>
                          ) : parsedTitle.tag ? null : (
                            <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-orbit-muted">
                              untitled
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {item.meta ? (
                            <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-muted">
                              {item.meta}
                            </span>
                          ) : null}
                          <span
                            className={[
                              "font-mono text-[0.5rem] uppercase tracking-widest",
                              activeDragId === item.id || swapTargetId === item.id
                                ? "text-orbit-accent"
                                : "text-orbit-muted",
                            ].join(" ")}
                          >
                            {swapTargetId === item.id
                              ? "drop here"
                              : activeDragId === item.id
                                ? "dragging"
                                : "drag"}
                          </span>
                        </span>
                      </button>

                      {onRemoveItem ? (
                        <button
                          type="button"
                          className={[
                            "flex h-full w-7 shrink-0 items-center justify-center border-l font-mono text-[0.72rem] uppercase transition-colors duration-150",
                            activeDragId === item.id || swapTargetId === item.id
                              ? "border-orbit-accent text-orbit-accent"
                              : "border-orbit-border text-orbit-muted hover:border-orbit-accent hover:bg-orbit-panel hover:text-orbit-accent",
                          ].join(" ")}
                          aria-label={`Hide ${item.title ?? item.label ?? item.id}`}
                          title="Hide this feed"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveItem(item.id);
                          }}
                        >
                          x
                        </button>
                      ) : null}
                    </div>

                    <div className="min-h-0 flex-1">{item.node}</div>
                  </div>
                </div>

                {allowRowResize ? (
                  <button
                    type="button"
                    className="absolute inset-x-0 bottom-0 z-20 flex h-2 cursor-row-resize items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    title="Drag to resize height. Double-click to reset"
                    onDoubleClick={() => {
                      setSizes((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          rowSpan: item.defaultRowSpan ?? DEFAULT_ROW_SPAN,
                        },
                      }));
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();

                      const startY = event.clientY;
                      const startRowSpan = size.rowSpan;

                      const onPointerMove = (moveEvent: PointerEvent) => {
                        const nextRowSpan = clamp(
                          startRowSpan +
                            Math.round((moveEvent.clientY - startY) / rowStepPx),
                          MIN_ROW_SPAN,
                          MAX_ROW_SPAN,
                        );

                        setSizes((current) => ({
                          ...current,
                          [item.id]: {
                            ...current[item.id],
                            rowSpan: nextRowSpan,
                          },
                        }));
                      };

                      const onPointerUp = () => {
                        window.removeEventListener("pointermove", onPointerMove);
                        window.removeEventListener("pointerup", onPointerUp);
                      };

                      window.addEventListener("pointermove", onPointerMove);
                      window.addEventListener("pointerup", onPointerUp);
                    }}
                  >
                    <span className="mx-auto block h-px w-8 bg-orbit-border-strong opacity-60" />
                  </button>
                ) : null}

                {allowColumnResize && columnCount > 1 ? (
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 top-7 z-20 flex w-2 cursor-col-resize items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    title="Drag to resize width. Double-click to reset"
                    onDoubleClick={() => {
                      setSizes((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          colSpan: item.defaultColSpan ?? DEFAULT_COL_SPAN,
                        },
                      }));
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();

                      const startX = event.clientX;
                      const startColSpan = size.colSpan;

                      const onPointerMove = (moveEvent: PointerEvent) => {
                        const nextColSpan = clamp(
                          startColSpan +
                            Math.round(
                              (moveEvent.clientX - startX) / COL_STEP_PX,
                            ),
                          1,
                          columnCount,
                        );

                        setSizes((current) => ({
                          ...current,
                          [item.id]: {
                            ...current[item.id],
                            colSpan: nextColSpan,
                          },
                        }));
                      };

                      const onPointerUp = () => {
                        window.removeEventListener(
                          "pointermove",
                          onPointerMove,
                        );
                        window.removeEventListener("pointerup", onPointerUp);
                      };

                      window.addEventListener("pointermove", onPointerMove);
                      window.addEventListener("pointerup", onPointerUp);
                    }}
                  >
                    <span className="block h-8 w-px bg-orbit-border-strong opacity-60" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-orbit-border bg-orbit-bg-elevated p-4 text-center">
          <p className="font-mono text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
            {emptyTitle}
          </p>
          <p className="mt-2 text-[0.74rem] leading-[1.55] text-orbit-muted">
            {emptyDescription}
          </p>
        </div>
      )}

      {dragState && draggedItem ? (
        <div
          className="pointer-events-none fixed left-0 top-0 z-50"
          style={{
            width: dragState.width,
            height: dragState.height,
            transform: `translate3d(${dragState.pointerX - dragState.offsetX}px, ${dragState.pointerY - dragState.offsetY}px, 0)`,
          }}
        >
          <div className="h-full min-h-0 border border-orbit-accent bg-orbit-bg-elevated">
            <div className="flex h-full min-h-0 flex-col">
              <div
                className="flex items-center justify-between border-b border-orbit-accent bg-orbit-bg px-3"
                style={{ height: `${WINDOW_BAR_HEIGHT_PX}px` }}
              >
                <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                  <span className="shrink-0 text-[0.86rem] leading-none text-orbit-accent">
                    ::
                  </span>
                  {draggedItem?.title || draggedItem?.label ? (
                    <span className="orbit-token-ellipsis font-display text-[0.72rem] font-semibold tracking-[-0.01em] text-orbit-accent">
                      {draggedItem.title ?? draggedItem.label}
                    </span>
                  ) : (
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-orbit-accent">
                      slot
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[0.5rem] uppercase tracking-widest text-orbit-accent">
                  {swapTargetId ? "swap" : "routing"}
                </span>
              </div>
              <div className="min-h-0 flex-1 opacity-95">
                {draggedItem.node}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceSection({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel">
      <div className="border-b border-orbit-border bg-orbit-bg px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
            {eyebrow}
          </p>
          <div className="flex items-center gap-2">
            {action}
          </div>
        </div>
        <h2 className="mt-1 font-display text-[0.86rem] font-semibold text-orbit-text">
          {title}
        </h2>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function DefaultMainPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel p-4 md:p-5">
      <div className="border-b border-orbit-border pb-3">
        <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
          Dashboard
        </p>
        <h1 className="mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.28rem]">
          AI World Monitor
        </h1>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center border border-orbit-border bg-orbit-bg p-5 text-center">
        <div className="max-w-xl">
          <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent-dim">
            Getting Started
          </p>
          <p className="mt-3 text-[0.84rem] leading-[1.65] text-orbit-muted">
            Benchmark rankings, document details, and category overviews appear
            here.
          </p>
        </div>
      </div>
    </section>
  );
}

export function PanelWorkspace({
  mainPanel,
  summaryPanel,
  infoPanelOverride,
  infoItems,
  unassignedItems = [],
  rowHeightPx = DEFAULT_GRID_ROW_HEIGHT_PX,
}: PanelWorkspaceProps) {
  const infoItemIds = infoItems.map((item) => item.id);
  const infoItemIdSet = new Set(infoItemIds);
  const [hiddenInfoItemIds, setHiddenInfoItemIds] = useState(() =>
    loadIdList(infoItemIds, PANEL_WORKSPACE_STORAGE.infoHidden),
  );
  const [isInfoPanelPickerOpen, setIsInfoPanelPickerOpen] = useState(false);
  const [draftHiddenInfoItemIds, setDraftHiddenInfoItemIds] = useState<
    string[]
  >([]);
  const [draftInfoItemOrder, setDraftInfoItemOrder] = useState<string[]>(() =>
    loadOrder(infoItemIds, PANEL_WORKSPACE_STORAGE.infoOrder),
  );
  const [infoBoardVersion, setInfoBoardVersion] = useState(0);
  const resolvedHiddenInfoItemIds = hiddenInfoItemIds.filter((id) =>
    infoItemIdSet.has(id),
  );
  const hiddenInfoItemIdSet = new Set(resolvedHiddenInfoItemIds);
  const visibleInfoItems = infoItems.filter(
    (item) => !hiddenInfoItemIdSet.has(item.id),
  );
  const hiddenInfoItems = infoItems.filter((item) =>
    hiddenInfoItemIdSet.has(item.id),
  );
  const resolvedDraftInfoItemOrder = useMemo(() => {
    const valid = draftInfoItemOrder.filter((id) => infoItemIdSet.has(id));
    const missing = infoItemIds.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  }, [draftInfoItemOrder, infoItemIdSet, infoItemIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PANEL_WORKSPACE_STORAGE.infoHidden,
      JSON.stringify(resolvedHiddenInfoItemIds),
    );
  }, [resolvedHiddenInfoItemIds]);

  function hideInfoItem(itemId: string) {
    setHiddenInfoItemIds((current) =>
      current.includes(itemId) ? current : [...current, itemId],
    );
  }

  function openInfoPanelPicker() {
    setDraftHiddenInfoItemIds(resolvedHiddenInfoItemIds);
    setDraftInfoItemOrder(loadOrder(infoItemIds, PANEL_WORKSPACE_STORAGE.infoOrder));
    setIsInfoPanelPickerOpen(true);
  }

  function closeInfoPanelPicker() {
    setDraftHiddenInfoItemIds(resolvedHiddenInfoItemIds);
    setDraftInfoItemOrder(loadOrder(infoItemIds, PANEL_WORKSPACE_STORAGE.infoOrder));
    setIsInfoPanelPickerOpen(false);
  }

  function toggleDraftInfoItem(itemId: string) {
    setDraftHiddenInfoItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function reorderDraftInfoItem(activeId: string, targetId: string) {
    setDraftInfoItemOrder((current) =>
      moveItemBefore(
        current.filter((id) => infoItemIdSet.has(id)).concat(
          infoItemIds.filter((id) => !current.includes(id)),
        ),
        activeId,
        targetId,
      ),
    );
  }

  function resolveGroupItemIds(groupLabel: string) {
    return infoItems
      .filter((item) => (item.label?.trim() || "Other") === groupLabel)
      .map((item) => item.id);
  }

  function showInfoItemGroup(groupLabel: string) {
    const groupIds = resolveGroupItemIds(groupLabel);
    setDraftHiddenInfoItemIds((current) =>
      current.filter((id) => !groupIds.includes(id)),
    );
  }

  function hideInfoItemGroup(groupLabel: string) {
    const groupIds = resolveGroupItemIds(groupLabel);
    setDraftHiddenInfoItemIds((current) => [
      ...new Set([...current, ...groupIds]),
    ]);
  }

  function showOnlyInfoItemGroup(groupLabel: string) {
    const groupIds = new Set(resolveGroupItemIds(groupLabel));
    setDraftHiddenInfoItemIds(infoItemIds.filter((id) => !groupIds.has(id)));
  }

  function showAllInfoItems() {
    setDraftHiddenInfoItemIds([]);
  }

  function hideAllInfoItems() {
    setDraftHiddenInfoItemIds(infoItemIds);
  }

  function applyInfoPanelVisibility() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        PANEL_WORKSPACE_STORAGE.infoOrder,
        JSON.stringify(resolvedDraftInfoItemOrder),
      );
    }
    setHiddenInfoItemIds(draftHiddenInfoItemIds);
    setInfoBoardVersion((current) => current + 1);
    setIsInfoPanelPickerOpen(false);
  }

  const hasUnassigned = unassignedItems.length > 0;
  const bottomPanel =
    summaryPanel ??
    (hasUnassigned ? (
      <WorkspaceSection eyebrow="More Sources" title="Additional Source Panels">
        <PanelBoard
          items={unassignedItems}
          orderStorageKey={PANEL_WORKSPACE_STORAGE.unassignedOrder}
          sizeStorageKey={PANEL_WORKSPACE_STORAGE.unassignedSize}
          emptyTitle="No additional source panels"
          emptyDescription="All source panels are shown above."
          rowHeightPx={rowHeightPx}
        />
      </WorkspaceSection>
    ) : null);

  return (
    <div className="h-full overflow-hidden bg-orbit-bg p-1.5 md:p-2">
      <div className="grid h-full min-h-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,3fr)] xl:grid-rows-[5fr_4fr]">
        <div className="min-h-0 overflow-hidden xl:col-start-1 xl:col-span-2 xl:row-start-1">
          {mainPanel ?? <DefaultMainPanel />}
        </div>

        <div className="min-h-0 overflow-hidden xl:col-start-3 xl:row-start-1 xl:row-span-2">
          <WorkspaceSection
            eyebrow={infoPanelOverride ? "Selected Source" : "Browse Sources"}
            title={infoPanelOverride?.title ?? "Side Panel"}
            action={
              infoItems.length > 0 ? (
                <button
                  type="button"
                  className="shrink-0 border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                onClick={openInfoPanelPicker}
              >
                  manage panels
                </button>
              ) : null
            }
          >
            {infoPanelOverride?.node ?? (
              <PanelBoard
                key={`info-board-${infoBoardVersion}`}
                items={visibleInfoItems}
                orderStorageKey={PANEL_WORKSPACE_STORAGE.infoOrder}
                sizeStorageKey={PANEL_WORKSPACE_STORAGE.infoSize}
                emptyTitle={
                  hiddenInfoItems.length > 0
                    ? "All source panels are hidden"
                    : "No source panels yet"
                }
                emptyDescription={
                  hiddenInfoItems.length > 0
                    ? "Click manage panels above to show hidden panels."
                    : "Source panels will appear here once data is loaded."
                }
                maxDynamicColumns={3}
                minColumnWidthPx={320}
                allowColumnResize={false}
                allowRowResize={false}
                rowHeightPx={rowHeightPx}
                onRemoveItem={hideInfoItem}
              />
            )}
          </WorkspaceSection>
        </div>

        {bottomPanel ? (
          <div className="min-h-0 overflow-hidden xl:col-start-1 xl:col-span-2 xl:row-start-2">
            {bottomPanel}
          </div>
        ) : null}
      </div>

      <InfoPanelVisibilityModal
        isOpen={isInfoPanelPickerOpen}
        items={infoItems}
        hiddenItemIds={draftHiddenInfoItemIds}
        orderedItemIds={resolvedDraftInfoItemOrder}
        onClose={closeInfoPanelPicker}
        onToggleItem={toggleDraftInfoItem}
        onReorderItem={reorderDraftInfoItem}
        onShowGroup={showInfoItemGroup}
        onHideGroup={hideInfoItemGroup}
        onShowOnlyGroup={showOnlyInfoItemGroup}
        onShowAll={showAllInfoItems}
        onHideAll={hideAllInfoItems}
        onApply={applyInfoPanelVisibility}
      />
    </div>
  );
}
