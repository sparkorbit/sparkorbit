import { useEffect, useRef, useState, useMemo, type CSSProperties } from "react";

import type { FeedPanel as FeedPanelData } from "../../content/dashboardContent";
import { formatDisplayDate } from "../../features/dashboard/display";
import { categoryAccentColor } from "./styles";

const htmlEntityDecoder =
  typeof document !== "undefined" ? document.createElement("textarea") : null;
const COMPACT_PANEL_HEIGHT_PX = 460;


function formatFeedScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "";
  }

  return `score ${Math.round(value).toLocaleString()}`;
}

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
  const shouldShowCommunityScore = panelData.eyebrow === "Community";

  const revealKey = useMemo(() => panelData.id, [panelData.id]);
  const [shouldReveal, setShouldReveal] = useState(true);
  useEffect(() => {
    setShouldReveal(true);
    const timer = setTimeout(() => setShouldReveal(false), panelData.items.length * 60 + 800);
    return () => clearTimeout(timer);
  }, [revealKey, panelData.items.length]);

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
            const resolvedMeta = decodeHtmlEntities(item.meta);
            const resolvedNote = decodeHtmlEntities(item.note);
            const resolvedTimestamp = formatDisplayDate(item.timestamp);
            const resolvedTimestampLabel =
              item.timestampLabel && item.timestampLabel !== "Published" && item.timestampLabel !== "Created"
                ? `${item.timestampLabel} `
                : "";
            const scoreLabel =
              shouldShowCommunityScore && item.feedScore
                ? formatFeedScore(item.feedScore)
                : item.engagementLabel || "";
            const isSelected = selectedDocumentId === item.documentId;
            const isOdd = index % 2 === 1;

            return (
              <button
                key={item.documentId}
                type="button"
                data-feed-item-document-id={item.documentId}
                className={[
                  "group/item min-w-0 cursor-pointer text-left transition-all duration-150",
                  shouldReveal ? "orbit-hacker-reveal" : "",
                ].join(" ")}
                style={{
                  ...(shouldReveal ? { "--hacker-delay": `${index * 60}ms` } as CSSProperties : {}),
                  backgroundColor: isSelected
                    ? `color-mix(in srgb, ${catColor} 15%, var(--color-orbit-bg-elevated))`
                    : isOdd
                      ? `color-mix(in srgb, ${catColor} 4%, var(--color-orbit-bg-elevated))`
                      : `color-mix(in srgb, ${catColor} 2%, var(--color-orbit-bg))`,
                }}
                onClick={() => onSelectItem?.(item.documentId)}
              >
                <div className={["flex min-h-0", shouldReveal ? "orbit-hacker-reveal__content" : ""].join(" ")}>
                  {/* category color bar */}
                  <div
                    className="w-[3px] shrink-0 transition-opacity duration-150"
                    style={{
                      backgroundColor: catColor,
                      opacity: isSelected ? 1 : 0.3,
                    }}
                  />

                  {isCompactLayout ? (
                    <div className="min-w-0 flex-1 px-3 py-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className={[
                            "orbit-line-clamp-1 orbit-wrap-anywhere min-w-0 font-display text-[0.68rem] leading-[1.3] transition-colors duration-150",
                            isSelected
                              ? "font-bold text-orbit-accent"
                              : "font-semibold text-orbit-text group-hover/item:text-orbit-accent",
                          ].join(" ")}>
                            {resolvedTitle}
                          </h3>
                          {resolvedMeta ? (
                            <p className="orbit-line-clamp-1 orbit-wrap-anywhere mt-0.5 text-[0.52rem] leading-[1.35] text-orbit-accent-dim">
                              {resolvedMeta}
                            </p>
                          ) : null}
                        </div>
                        {(scoreLabel || resolvedTimestamp) ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {scoreLabel ? (
                              <span
                                className="font-mono text-[0.5rem] tabular-nums tracking-[0.06em]"
                                style={{ color: catColor, opacity: 0.9 }}
                              >
                                {scoreLabel}
                              </span>
                            ) : null}
                            {resolvedTimestamp ? (
                              <span className="font-mono text-[0.5rem] tabular-nums uppercase tracking-[0.08em] text-orbit-muted">
                                {resolvedTimestampLabel}{resolvedTimestamp}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1 px-3 py-2">
                      <h3 className={[
                        "orbit-line-clamp-2 orbit-wrap-anywhere min-w-0 font-display text-[0.72rem] leading-[1.3] transition-colors duration-150",
                        isSelected
                          ? "font-bold text-orbit-accent"
                          : "font-semibold text-orbit-text group-hover/item:text-orbit-accent",
                      ].join(" ")}>
                        {resolvedTitle}
                      </h3>
                      {resolvedMeta ? (
                        <p className="orbit-line-clamp-1 orbit-wrap-anywhere mt-1 text-[0.56rem] leading-[1.4] text-orbit-accent-dim">
                          {resolvedMeta}
                        </p>
                      ) : null}
                      {resolvedNote ? (
                        <p className="orbit-line-clamp-2 orbit-wrap-anywhere mt-1 text-[0.58rem] leading-[1.45] text-orbit-muted">
                          {resolvedNote}
                        </p>
                      ) : null}
                      {(scoreLabel || resolvedTimestamp) ? (
                        <div className="mt-1 flex items-center justify-end gap-2">
                          {scoreLabel ? (
                            <span
                              className="font-mono text-[0.52rem] tabular-nums tracking-[0.06em]"
                              style={{ color: catColor, opacity: 0.9 }}
                            >
                              {scoreLabel}
                            </span>
                          ) : null}
                          {resolvedTimestamp ? (
                            <span className="font-mono text-[0.52rem] tabular-nums uppercase tracking-[0.08em] text-orbit-muted">
                              {resolvedTimestampLabel}{resolvedTimestamp}
                            </span>
                          ) : null}
                        </div>
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
