import type { CSSProperties } from "react";

import type { FeedPanel as FeedPanelData } from "../../content/dashboardContent";
import { DashboardPanel } from "./DashboardPanel";
import { card, pill } from "./styles";

type SourcePanelProps = {
  panelData: FeedPanelData;
  sessionLabel: string;
  selectedDocumentId?: string | null;
  onSelectItem?: (documentId: string, referenceUrl: string) => void;
  style?: CSSProperties;
};

export function SourcePanel({
  panelData,
  sessionLabel,
  selectedDocumentId,
  onSelectItem,
  style,
}: SourcePanelProps) {
  return (
    <DashboardPanel
      eyebrow={panelData.eyebrow}
      title={panelData.title}
      sessionLabel={sessionLabel}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <p className="border-b border-orbit-border pb-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-orbit-accent-dim">
          {panelData.sourceNote}
        </p>

        <div className="grid min-h-0 flex-1 gap-2">
          {panelData.items.map((item) => (
            <button
              key={item.documentId}
              type="button"
              className={[
                `${card} grid grid-cols-[1fr_auto] gap-x-2 gap-y-1.5 text-left transition-colors duration-150`,
                onSelectItem
                  ? "hover:border-orbit-border-strong hover:bg-orbit-bg-elevated"
                  : "",
                selectedDocumentId === item.documentId
                  ? "border-orbit-accent"
                  : "",
              ].join(" ")}
              onClick={() => onSelectItem?.(item.documentId, item.referenceUrl)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.64rem] uppercase tracking-[0.12em] text-orbit-accent">
                  {item.source}
                </span>
                <span className={pill}>{item.type}</span>
              </div>
              <span className="font-mono text-right text-[0.64rem] uppercase tracking-[0.08em] text-orbit-muted">
                {item.meta}
              </span>
              <h3 className="font-display col-span-2 text-[0.8rem] font-semibold leading-[1.42] tracking-[-0.02em] text-orbit-text">
                {item.title}
              </h3>
              <p className="col-span-2 text-[0.72rem] leading-[1.48] text-orbit-muted">
                {item.note}
              </p>
            </button>
          ))}
        </div>
      </div>
    </DashboardPanel>
  );
}
