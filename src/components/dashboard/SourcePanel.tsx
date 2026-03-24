import type { CSSProperties } from "react";

import type { FeedPanel as FeedPanelData } from "../../content/dashboardContent";
import { DashboardPanel } from "./DashboardPanel";
import { card, pill } from "./styles";

type SourcePanelProps = {
  panelData: FeedPanelData;
  sessionLabel: string;
  style?: CSSProperties;
};

export function SourcePanel({
  panelData,
  sessionLabel,
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
        <p className="border-b border-[rgba(85,243,204,0.14)] pb-2 text-[0.72rem] leading-[1.45] text-orbit-teal">
          {panelData.sourceNote}
        </p>

        <div className="grid min-h-0 flex-1 gap-2">
          {panelData.items.map((item) => (
            <article
              key={`${item.source}-${item.title}`}
              className={`${card} grid grid-cols-[1fr_auto] gap-x-2 gap-y-1.5`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[rgba(124,255,155,0.14)] bg-[rgba(124,255,155,0.08)] px-2 py-1 text-[0.66rem] leading-none text-orbit-accent">
                  {item.source}
                </span>
                <span className={pill}>{item.type}</span>
              </div>
              <span className="text-right text-[0.67rem] leading-none text-orbit-muted">
                {item.meta}
              </span>
              <h3 className="font-display col-span-2 text-[0.8rem] font-semibold leading-[1.42] tracking-[-0.02em] text-orbit-text">
                {item.title}
              </h3>
              <p className="col-span-2 text-[0.72rem] leading-[1.48] text-orbit-muted">
                {item.note}
              </p>
            </article>
          ))}
        </div>
      </div>
    </DashboardPanel>
  );
}
