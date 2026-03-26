import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { FeedPanel as FeedPanelData } from "../../content/dashboardContent";
import { formatDisplayDate } from "../../features/dashboard/display";
import { DashboardPanel } from "./DashboardPanel";
import { card } from "./styles";

const htmlEntityDecoder =
  typeof document !== "undefined" ? document.createElement("textarea") : null;
const COMPACT_PANEL_HEIGHT_PX = 460;

function decodeHtmlEntities(value: string) {
  if (htmlEntityDecoder === null || !value.includes("&")) {
    return value;
  }

  htmlEntityDecoder.innerHTML = value;
  return htmlEntityDecoder.value;
}

type SourcePanelProps = {
  panelData: FeedPanelData;
  selectedDocumentId?: string | null;
  onSelectItem?: (documentId: string) => void;
  style?: CSSProperties;
};

export function SourcePanel({
  panelData,
  selectedDocumentId,
  onSelectItem,
  style,
}: SourcePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isCompactLayout, setIsCompactLayout] = useState(false);

  useEffect(() => {
    const contentElement = panelRef.current?.parentElement;
    const gridItemElement = panelRef.current?.closest("[data-panel-item-id]");
    const observedElement =
      gridItemElement instanceof HTMLElement ? gridItemElement : contentElement;

    if (!(observedElement instanceof HTMLElement)) {
      return;
    }

    const syncLayout = () => {
      setIsCompactLayout(observedElement.clientHeight < COMPACT_PANEL_HEIGHT_PX);
    };

    syncLayout();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncLayout)
        : null;

    resizeObserver?.observe(observedElement);
    if (
      contentElement instanceof HTMLElement &&
      contentElement !== observedElement
    ) {
      resizeObserver?.observe(contentElement);
    }
    window.addEventListener("resize", syncLayout);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncLayout);
    };
  }, []);

  return (
    <DashboardPanel style={style}>
      <div
        ref={panelRef}
        className={[
          "grid min-h-0 flex-1",
          isCompactLayout ? "gap-px" : "gap-1",
        ].join(" ")}
      >
        {panelData.items.map((item) => {
          const resolvedTitle = decodeHtmlEntities(item.title);
          const resolvedMeta = decodeHtmlEntities(item.meta);
          const resolvedNote = decodeHtmlEntities(item.note);
          const resolvedTimestamp = formatDisplayDate(item.timestamp);

          return (
            <button
              key={item.documentId}
              type="button"
              className={[
                `${card} min-w-0 overflow-hidden p-0 text-left transition-colors duration-150`,
                onSelectItem
                  ? "hover:border-orbit-border-strong hover:bg-orbit-bg-elevated"
                  : "",
                selectedDocumentId === item.documentId
                  ? "border-orbit-accent bg-orbit-panel"
                  : "",
              ].join(" ")}
              onClick={() => onSelectItem?.(item.documentId)}
            >
              {isCompactLayout ? (
                <div className="flex items-start gap-1.5 px-2 py-1.5">
                  <span
                    aria-hidden="true"
                    className={[
                      "mt-[0.22rem] shrink-0 text-[0.5rem] leading-none",
                      selectedDocumentId === item.documentId
                        ? "text-orbit-accent"
                        : "text-orbit-accent-dim",
                    ].join(" ")}
                  >
                    &bull;
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="orbit-line-clamp-2 orbit-wrap-anywhere font-display text-[0.75rem] font-semibold leading-[1.18] tracking-[-0.01em] text-orbit-text">
                      {resolvedTitle}
                    </h3>
                    {resolvedTimestamp ? (
                      <p className="mt-0.5 font-mono text-[0.46rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                        {resolvedTimestamp}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 px-2.5 py-2">
                  <span
                    aria-hidden="true"
                    className={[
                      "mt-[0.3rem] shrink-0 text-[0.56rem] leading-none",
                      selectedDocumentId === item.documentId
                        ? "text-orbit-accent"
                        : "text-orbit-accent-dim",
                    ].join(" ")}
                  >
                    &bull;
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="orbit-line-clamp-2 orbit-wrap-anywhere font-display text-[0.8rem] font-semibold leading-[1.3] tracking-[-0.01em] text-orbit-text">
                      {resolvedTitle}
                    </h3>
                    <p className="orbit-wrap-anywhere mt-1 font-mono text-[0.48rem] uppercase tracking-[0.08em] text-orbit-accent-dim">
                      {[resolvedTimestamp, resolvedMeta]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                    {resolvedNote ? (
                      <p className="orbit-line-clamp-1 orbit-wrap-anywhere mt-1 text-[0.66rem] leading-[1.45] text-orbit-muted">
                        {resolvedNote}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
