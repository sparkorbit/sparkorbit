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
  onClose,
  onToggleItem,
  onShowAll,
  onHideAll,
  onApply,
}: {
  isOpen: boolean;
  items: PanelWorkspaceItem[];
  hiddenItemIds: string[];
  onClose: () => void;
  onToggleItem: (itemId: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onApply: () => void;
}) {
  const hiddenItemIdSet = new Set(hiddenItemIds);
  const visibleCount = items.length - hiddenItemIds.length;

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
                panel picker
              </p>
              <h2 className="mt-1.5 font-display text-[0.9rem] font-semibold text-orbit-text">
                Info Panel Cards
              </h2>
              <p className="mt-1.5 text-[0.68rem] leading-[1.45] text-orbit-muted">
                Click items to toggle card visibility, then apply.
              </p>
            </div>

            <button
              type="button"
              className="shrink-0 border border-orbit-border bg-orbit-panel px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
              onClick={onClose}
            >
              seal
            </button>
          </div>
        </div>

        <div className="orbit-scrollbar-hidden relative z-10 min-h-0 flex-1 overflow-auto p-2.5">
          {items.length === 0 ? (
            <div className="flex min-h-[180px] items-center justify-center border border-orbit-border bg-orbit-bg p-4 text-center">
              <div className="max-w-sm">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  no cards
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  No cards available to control in the info panel.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2">
              {items.map((item) => {
                const resolvedTitle = item.title ?? item.label ?? item.id;
                const isHidden = hiddenItemIdSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={!isHidden}
                    className={[
                      "group min-w-0 border p-2 text-left transition-colors duration-150",
                      isHidden
                        ? "border-orbit-border bg-orbit-bg hover:border-orbit-accent/70 hover:bg-orbit-bg-elevated"
                        : "border-orbit-accent/70 bg-orbit-panel",
                    ].join(" ")}
                    onClick={() => onToggleItem(item.id)}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      {item.label ? (
                        <span
                          className={[
                            "inline-flex shrink-0 border px-1.5 py-0.5 font-mono text-[0.48rem] uppercase tracking-[0.12em]",
                            isHidden
                              ? "border-orbit-border bg-orbit-panel text-orbit-accent"
                              : "border-orbit-accent bg-orbit-bg text-orbit-accent",
                          ].join(" ")}
                        >
                          {item.label}
                        </span>
                      ) : (
                        <span />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-start justify-between gap-2">
                      <h3 className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.76rem] font-semibold leading-[1.32] text-orbit-text">
                        {resolvedTitle}
                      </h3>
                      {item.meta ? (
                        <span className="shrink-0 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-orbit-muted">
                          {item.meta}
                        </span>
                      ) : null}
                    </div>
                  </button>
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
                apply visibility
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
                    "h-full min-h-0 border bg-orbit-bg-elevated transition-colors duration-150",
                    swapTargetId === item.id
                      ? "border-orbit-accent"
                      : "border-orbit-border group-hover:border-orbit-border-strong",
                    activeDragId === item.id ? "opacity-25" : "",
                  ].join(" ")}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div
                      className={[
                        "flex h-7 min-w-0 items-stretch justify-between border-b bg-orbit-bg transition-colors duration-150",
                        activeDragId === item.id || swapTargetId === item.id
                          ? "border-orbit-accent"
                          : "border-orbit-border group-hover:border-orbit-border-strong",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 touch-none items-center justify-between px-3 text-left"
                        onPointerDown={(event) =>
                          beginPanelDrag(event, item.id)
                        }
                        title="Grab to reroute slot position"
                      >
                        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                          <span
                            className={[
                              "shrink-0 text-[0.86rem] leading-none",
                              activeDragId === item.id
                                ? "text-orbit-accent"
                                : "text-orbit-accent-dim",
                            ].join(" ")}
                          >
                            ::
                          </span>
                          {resolvedTitle ? (
                            <span
                              className={[
                                "orbit-token-ellipsis font-display text-[0.72rem] font-semibold tracking-[-0.01em]",
                                activeDragId === item.id ||
                                swapTargetId === item.id
                                  ? "text-orbit-accent"
                                  : "text-orbit-text",
                              ].join(" ")}
                            >
                              {resolvedTitle}
                            </span>
                          ) : (
                            <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-orbit-muted">
                              slot
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
                              ? "swap"
                              : activeDragId === item.id
                                ? "routing"
                                : "move"}
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
                          aria-label={`Close ${item.title ?? item.label ?? item.id} card`}
                          title="Hide this card"
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

                    {item.label || item.detail ? (
                      <div className="border-b border-orbit-border bg-orbit-panel/45 px-3 py-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {item.label ? (
                            <span className="inline-flex shrink-0 border border-orbit-border bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.46rem] uppercase tracking-[0.12em] text-orbit-accent">
                              {item.label}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="min-h-0 flex-1 p-px">{item.node}</div>
                  </div>
                </div>

                <button
                  type="button"
                  className="absolute inset-x-0 bottom-0 z-20 flex h-2 cursor-row-resize items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  title="Drag to adjust row span. Double-click to reset to default"
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

                {allowColumnResize && columnCount > 1 ? (
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 top-7 z-20 flex w-2 cursor-col-resize items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    title="Drag to adjust col span. Double-click to reset to default"
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
              <div className="min-h-0 flex-1 p-px opacity-95">
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
  itemCount,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  itemCount?: number;
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
            {itemCount != null && itemCount > 0 ? (
              <span className="shrink-0 border border-orbit-border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
                {itemCount} panels
              </span>
            ) : null}
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
          Core Slot
        </p>
        <h1 className="mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.28rem]">
          Main Panel Reserved
        </h1>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center border border-orbit-border bg-orbit-bg p-5 text-center">
        <div className="max-w-xl">
          <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent-dim">
            Reserved Space
          </p>
          <p className="mt-3 text-[0.84rem] leading-[1.65] text-orbit-muted">
            Main visualizations, detail views, and expanded content appear in
            this area.
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
    setIsInfoPanelPickerOpen(true);
  }

  function closeInfoPanelPicker() {
    setDraftHiddenInfoItemIds(resolvedHiddenInfoItemIds);
    setIsInfoPanelPickerOpen(false);
  }

  function toggleDraftInfoItem(itemId: string) {
    setDraftHiddenInfoItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function showAllInfoItems() {
    setDraftHiddenInfoItemIds([]);
  }

  function hideAllInfoItems() {
    setDraftHiddenInfoItemIds(infoItemIds);
  }

  function applyInfoPanelVisibility() {
    setHiddenInfoItemIds(draftHiddenInfoItemIds);
    setIsInfoPanelPickerOpen(false);
  }

  const hasUnassigned = unassignedItems.length > 0;
  const bottomPanel =
    summaryPanel ??
    (hasUnassigned ? (
      <WorkspaceSection eyebrow="Overflow Rack" title="Loose Panels">
        <PanelBoard
          items={unassignedItems}
          orderStorageKey={PANEL_WORKSPACE_STORAGE.unassignedOrder}
          sizeStorageKey={PANEL_WORKSPACE_STORAGE.unassignedSize}
          emptyTitle="No remaining panels"
          emptyDescription="No panels awaiting classification."
          rowHeightPx={rowHeightPx}
        />
      </WorkspaceSection>
    ) : null);

  return (
    <div className="h-full overflow-hidden bg-orbit-bg p-1.5 md:p-2">
      <div className="grid h-full min-h-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,3fr)] xl:grid-rows-3">
        <div className="min-h-0 overflow-hidden xl:col-start-1 xl:col-span-2 xl:row-start-1 xl:row-span-2">
          {mainPanel ?? <DefaultMainPanel />}
        </div>

        <div className="min-h-0 overflow-hidden xl:col-start-3 xl:row-start-1 xl:row-span-3">
          <WorkspaceSection
            eyebrow="Details"
            title={infoPanelOverride?.title ?? "Selected Items"}
            itemCount={infoPanelOverride ? undefined : visibleInfoItems.length}
            action={
              infoItems.length > 0 ? (
                <button
                  type="button"
                  className="shrink-0 border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                  onClick={openInfoPanelPicker}
                >
                  panels {visibleInfoItems.length}/{infoItems.length}
                </button>
              ) : null
            }
          >
            {infoPanelOverride?.node ?? (
              <PanelBoard
                items={visibleInfoItems}
                orderStorageKey={PANEL_WORKSPACE_STORAGE.infoOrder}
                sizeStorageKey={PANEL_WORKSPACE_STORAGE.infoSize}
                emptyTitle={
                  hiddenInfoItems.length > 0 ? "All panels are hidden" : "No items yet"
                }
                emptyDescription={
                  hiddenInfoItems.length > 0
                    ? "Use the panels button in the header to restore hidden panels."
                    : "Select a panel or document to view details here."
                }
                maxDynamicColumns={3}
                minColumnWidthPx={320}
                rowHeightPx={rowHeightPx}
                onRemoveItem={hideInfoItem}
              />
            )}
          </WorkspaceSection>
        </div>

        {bottomPanel ? (
          <div className="min-h-0 overflow-hidden xl:col-start-1 xl:col-span-2 xl:row-start-3">
            {bottomPanel}
          </div>
        ) : null}
      </div>

      <InfoPanelVisibilityModal
        isOpen={isInfoPanelPickerOpen}
        items={infoItems}
        hiddenItemIds={draftHiddenInfoItemIds}
        onClose={closeInfoPanelPicker}
        onToggleItem={toggleDraftInfoItem}
        onShowAll={showAllInfoItems}
        onHideAll={hideAllInfoItems}
        onApply={applyInfoPanelVisibility}
      />
    </div>
  );
}
