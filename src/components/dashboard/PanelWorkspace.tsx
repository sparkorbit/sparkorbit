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
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
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
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
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
    <div className="h-full overflow-auto bg-orbit-bg p-1">
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
                  <button
                    type="button"
                    className={[
                      "flex h-7 w-full touch-none items-center justify-between border-b bg-orbit-bg px-3 text-left font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] transition-colors duration-150",
                      activeDragId === item.id || swapTargetId === item.id
                        ? "border-orbit-accent text-orbit-accent"
                        : "border-orbit-border text-orbit-muted hover:border-orbit-border-strong hover:text-orbit-text",
                    ].join(" ")}
                    onPointerDown={(event) => beginPanelDrag(event, item.id)}
                    title="상단바를 잡고 드래그하면 패널 위치를 교환합니다"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[0.86rem] leading-none text-orbit-accent">
                        ::
                      </span>
                      패널 이동
                    </span>
                    <span>
                      {swapTargetId === item.id
                        ? "교환 대상"
                        : activeDragId === item.id
                          ? "이동 중"
                          : "드래그"}
                    </span>
                  </button>

                  <div className="min-h-0 flex-1 p-px">{item.node}</div>
                </div>
              </div>

              <button
                type="button"
                className="absolute inset-x-10 bottom-0 z-20 flex h-4 cursor-row-resize items-center justify-center border-x border-t border-orbit-border bg-orbit-bg transition-colors duration-150 hover:border-orbit-border-strong"
                title="드래그해서 높이를 조절합니다. 더블클릭하면 기본 크기로 돌아갑니다"
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
                <span className="mx-auto block h-px w-14 bg-orbit-accent-dim" />
              </button>

              {allowColumnResize && columnCount > 1 ? (
                <button
                  type="button"
                  className="absolute bottom-10 right-0 z-20 flex w-4 cursor-col-resize items-center justify-center border-y border-l border-orbit-border bg-orbit-bg transition-colors duration-150 hover:border-orbit-border-strong"
                  style={{ top: "4.8rem" }}
                  title="드래그해서 너비를 조절합니다. 더블클릭하면 기본 크기로 돌아갑니다"
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
                      window.removeEventListener("pointermove", onPointerMove);
                      window.removeEventListener("pointerup", onPointerUp);
                    };

                    window.addEventListener("pointermove", onPointerMove);
                    window.addEventListener("pointerup", onPointerUp);
                  }}
                >
                  <span className="block h-14 w-px bg-orbit-accent-dim" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

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
                className="flex items-center justify-between border-b border-orbit-accent bg-orbit-bg px-3 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent"
                style={{ height: `${WINDOW_BAR_HEIGHT_PX}px` }}
              >
                <span className="flex items-center gap-2">
                  <span className="text-[0.86rem] leading-none">::</span>
                  패널 이동
                </span>
                <span>{swapTargetId ? "교환 준비" : "이동 중"}</span>
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
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col border border-orbit-border bg-orbit-panel">
      <div className="border-b border-orbit-border bg-orbit-bg px-3 py-2.5">
        <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
          {eyebrow}
        </p>
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
          Main Panel
        </p>
        <h1 className="mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.28rem]">
          Primary Workspace Reserved
        </h1>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center border border-orbit-border bg-orbit-bg p-5 text-center">
        <div className="max-w-xl">
          <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent-dim">
            Primary Surface
          </p>
          <p className="mt-3 text-[0.84rem] leading-[1.65] text-orbit-muted">
            메인 시각화, 대화 결과, drill-down detail, agent workspace 같은 주
            작업 화면은 이 영역에 들어오도록 예약합니다.
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
  const hasUnassigned = unassignedItems.length > 0;
  const bottomPanel =
    summaryPanel ??
    (hasUnassigned ? (
      <WorkspaceSection eyebrow="Section 03" title="Unassigned Panel">
        <PanelBoard
          items={unassignedItems}
          orderStorageKey={PANEL_WORKSPACE_STORAGE.unassignedOrder}
          sizeStorageKey={PANEL_WORKSPACE_STORAGE.unassignedSize}
          emptyTitle="미지정 패널 없음"
          emptyDescription="분류되지 않은 패널이 아직 없습니다."
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
            eyebrow="Section 02"
            title={infoPanelOverride?.title ?? "Information Panel"}
          >
            {infoPanelOverride?.node ?? (
              <PanelBoard
                items={infoItems}
                orderStorageKey={PANEL_WORKSPACE_STORAGE.infoOrder}
                sizeStorageKey={PANEL_WORKSPACE_STORAGE.infoSize}
                emptyTitle="정보 패널 없음"
                emptyDescription="사이드로 보낼 정보 패널이 아직 연결되지 않았습니다."
                maxDynamicColumns={3}
                minColumnWidthPx={320}
                rowHeightPx={rowHeightPx}
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
    </div>
  );
}
