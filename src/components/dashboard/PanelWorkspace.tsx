import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const ORDER_STORAGE_KEY = "sparkorbit-dashboard-order-v1";
const SIZE_STORAGE_KEY = "sparkorbit-dashboard-sizes-v1";
const COL_STEP_PX = 180;
const DEFAULT_ROW_SPAN = 4;
const DEFAULT_COL_SPAN = 1;
const MAX_ROW_SPAN = 8;

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
  items: PanelWorkspaceItem[];
};

type PanelPlacement = {
  id: string;
  colStart: number;
  rowStart: number;
  colSpan: number;
  rowSpan: number;
};

function getColumnCount() {
  if (typeof window === "undefined") {
    return 3;
  }

  if (window.matchMedia("(min-width: 1280px)").matches) {
    return 3;
  }

  if (window.matchMedia("(min-width: 768px)").matches) {
    return 2;
  }

  return 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseTrackSize(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moveItem(order: string[], activeId: string, targetId: string) {
  const next = [...order];
  const fromIndex = next.indexOf(activeId);
  const toIndex = next.indexOf(targetId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return order;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function loadOrder(ids: string[]) {
  if (typeof window === "undefined") {
    return ids;
  }

  try {
    const raw = window.localStorage.getItem(ORDER_STORAGE_KEY);

    if (!raw) {
      return ids;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return ids;
    }

    const valid = parsed.filter((value): value is string => ids.includes(value));
    const missing = ids.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return ids;
  }
}

function loadSizes(items: PanelWorkspaceItem[]) {
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
    const raw = window.localStorage.getItem(SIZE_STORAGE_KEY);

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
              2,
              MAX_ROW_SPAN,
            ),
            colSpan: clamp(
              Number(saved?.colSpan ?? fallback.colSpan),
              1,
              3,
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
    const rowSpan = clamp(size.rowSpan, 2, MAX_ROW_SPAN);

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

export function PanelWorkspace({ items }: PanelWorkspaceProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const [order, setOrder] = useState(() => loadOrder(ids));
  const [sizes, setSizes] = useState(() => loadSizes(items));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [columnCount, setColumnCount] = useState(getColumnCount);
  const [rowStepPx, setRowStepPx] = useState(80);

  useEffect(() => {
    const syncGridMetrics = () => {
      setColumnCount(getColumnCount());

      const grid = gridRef.current;
      if (!grid) {
        return;
      }

      const styles = window.getComputedStyle(grid);
      const autoRow = parseTrackSize(styles.gridAutoRows);
      const rowGap = parseTrackSize(styles.rowGap);

      if (autoRow > 0) {
        setRowStepPx(autoRow + rowGap);
      }
    };

    syncGridMetrics();
    window.addEventListener("resize", syncGridMetrics);
    return () => window.removeEventListener("resize", syncGridMetrics);
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
    window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(syncedOrder));
  }, [syncedOrder]);

  useEffect(() => {
    window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(syncedSizes));
  }, [syncedSizes]);

  const orderedItems = syncedOrder
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is PanelWorkspaceItem => Boolean(item));
  const placements = useMemo(
    () => computePlacements(orderedItems, syncedSizes, columnCount),
    [columnCount, orderedItems, syncedSizes],
  );

  return (
    <div className="h-full overflow-auto bg-[rgba(1,8,5,0.5)] p-1.5 md:p-2">
      <div
        ref={gridRef}
        className="grid auto-rows-[72px] grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3"
      >
        {orderedItems.map((item) => {
          const size = syncedSizes[item.id] ?? {
            rowSpan: item.defaultRowSpan ?? DEFAULT_ROW_SPAN,
            colSpan: item.defaultColSpan ?? DEFAULT_COL_SPAN,
          };
          const placement = placements.get(item.id);
          const resolvedColSpan = placement?.colSpan ?? clamp(size.colSpan, 1, columnCount);
          const resolvedRowSpan = placement?.rowSpan ?? size.rowSpan;
          const colStart = placement?.colStart ?? 1;
          const rowStart = placement?.rowStart ?? 1;

          return (
            <div
              key={item.id}
              className={[
                "group relative min-h-0 min-w-0 overflow-visible transition-transform duration-150",
                activeDragId === item.id ? "z-30 scale-[1.01] opacity-70" : "",
              ].join(" ")}
              style={{
                gridColumn: `${colStart} / span ${resolvedColSpan}`,
                gridRow: `${rowStart} / span ${resolvedRowSpan}`,
              }}
              onDragOver={(event) => {
                if (!activeDragId || activeDragId === item.id) {
                  return;
                }

                event.preventDefault();
                setOrder((current) => moveItem(current, activeDragId, item.id));
              }}
              onDrop={(event) => {
                event.preventDefault();
                setActiveDragId(null);
              }}
            >
              <div className="absolute left-4 top-0 z-20 -translate-y-1/2">
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setActiveDragId(item.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.id);
                  }}
                  onDragEnd={() => setActiveDragId(null)}
                  className="flex h-8 items-center gap-2 rounded-full border border-[rgba(124,255,155,0.18)] bg-[rgba(4,18,11,0.9)] px-3 font-display text-[0.64rem] font-bold uppercase tracking-[0.16em] text-[rgba(199,255,213,0.82)] shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur"
                  title="드래그해서 패널 순서를 바꿉니다"
                >
                  <span className="text-[0.9rem] leading-none text-orbit-accent">
                    ⋮⋮
                  </span>
                  이동
                </button>
              </div>

              <div className="h-full min-h-0 rounded-[1.2rem] border border-[rgba(124,255,155,0.12)] bg-[rgba(6,20,12,0.88)] p-[1px] shadow-[0_24px_60px_rgba(0,0,0,0.34)] transition-shadow duration-150 group-hover:shadow-[0_0_0_1px_rgba(124,255,155,0.08),0_30px_70px_rgba(0,0,0,0.4)]">
                {item.node}
              </div>

              <button
                type="button"
                className="absolute inset-x-10 bottom-1 z-20 h-4 cursor-row-resize rounded-full border border-transparent transition-colors duration-150 hover:border-[rgba(124,255,155,0.16)] hover:bg-[rgba(7,24,15,0.88)]"
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
                      2,
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
                <span className="mx-auto block h-1.5 w-14 rounded-full bg-[rgba(124,255,155,0.26)]" />
              </button>

              <button
                type="button"
                className="absolute bottom-10 right-1 z-20 flex w-4 cursor-col-resize items-center justify-center rounded-full border border-transparent transition-colors duration-150 hover:border-[rgba(124,255,155,0.16)] hover:bg-[rgba(7,24,15,0.88)]"
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
                        Math.round((moveEvent.clientX - startX) / COL_STEP_PX),
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
                <span className="block h-14 w-1.5 rounded-full bg-[rgba(124,255,155,0.26)]" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
