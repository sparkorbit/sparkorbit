import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { FeedPanel as FeedPanelData } from "../../content/dashboardContent";
import { formatDisplayDate } from "../../features/dashboard/display";
import { categoryAccentColor } from "./styles";

const htmlEntityDecoder =
  typeof document !== "undefined" ? document.createElement("textarea") : null;
const COMPACT_PANEL_HEIGHT_PX = 460;

function decodeHtmlEntities(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

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
  const catColor = categoryAccentColor(panelData.eyebrow);

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
    <div
      className="flex h-full min-h-0 flex-col"
      style={{
        ...style,
        backgroundColor: `color-mix(in srgb, ${catColor} 2%, var(--color-orbit-bg))`,
      }}
    >
      <div
        ref={panelRef}
        className="orbit-scrollbar-hidden min-h-0 flex-1 overflow-y-auto"
      >
        <div
          className="flex min-h-full flex-col gap-[1px]"
          style={{ backgroundColor: "var(--color-orbit-border)" }}
        >
          {panelData.items.map((item, index) => {
            const resolvedTitle = decodeHtmlEntities(item.title);
            const resolvedNote = decodeHtmlEntities(item.note);
            const resolvedTimestamp = formatDisplayDate(item.timestamp);
            const engagementLabel = item.engagementLabel || "";
            const isSelected = selectedDocumentId === item.documentId;
            const isOdd = index % 2 === 1;

            return (
              <button
                key={item.documentId}
                type="button"
                data-feed-item-document-id={item.documentId}
                className={[
                  "group min-w-0 text-left transition-all duration-150",
                  isSelected
                    ? ""
                    : onSelectItem
                      ? "hover:brightness-125"
                      : "",
                ].join(" ")}
                style={{
                  backgroundColor: isSelected
                    ? `color-mix(in srgb, ${catColor} 15%, var(--color-orbit-bg-elevated))`
                    : isOdd
                      ? `color-mix(in srgb, ${catColor} 4%, var(--color-orbit-bg-elevated))`
                      : `color-mix(in srgb, ${catColor} 2%, var(--color-orbit-bg))`,
                }}
                onClick={() => onSelectItem?.(item.documentId)}
              >
                <div className="flex min-h-0">
                  {/* category color bar */}
                  <div
                    className="w-[3px] shrink-0 transition-opacity duration-150"
                    style={{
                      backgroundColor: catColor,
                      opacity: isSelected ? 1 : 0.3,
                    }}
                  />

                  {isCompactLayout ? (
                    <div className="flex min-w-0 flex-1 items-baseline gap-2 px-3 py-2">
                      <h3 className="orbit-line-clamp-1 orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.74rem] font-semibold leading-[1.3] text-orbit-text">
                        {resolvedTitle}
                      </h3>
                      <div className="flex shrink-0 items-baseline gap-1.5">
                        {engagementLabel ? (
                          <span
                            className="font-mono text-[0.44rem] tabular-nums tracking-[0.08em]"
                            style={{ color: catColor, opacity: 0.85 }}
                          >
                            {engagementLabel}
                          </span>
                        ) : null}
                        {resolvedTimestamp ? (
                          <span className="font-mono text-[0.44rem] tabular-nums uppercase tracking-[0.1em] text-orbit-muted">
                            {resolvedTimestamp}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="orbit-line-clamp-2 orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.78rem] font-semibold leading-[1.35] text-orbit-text">
                          {resolvedTitle}
                        </h3>
                        <div className="mt-0.5 flex shrink-0 flex-col items-end gap-0.5">
                          {engagementLabel ? (
                            <span
                              className="font-mono text-[0.46rem] tabular-nums tracking-[0.08em]"
                              style={{ color: catColor, opacity: 0.85 }}
                            >
                              {engagementLabel}
                            </span>
                          ) : null}
                          {resolvedTimestamp ? (
                            <span className="font-mono text-[0.46rem] tabular-nums uppercase tracking-[0.1em] text-orbit-muted">
                              {resolvedTimestamp}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {resolvedNote ? (
                        <p className="orbit-line-clamp-1 orbit-wrap-anywhere mt-1 text-[0.64rem] leading-[1.5] text-orbit-muted">
                          {resolvedNote}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
