import type { CSSProperties } from "react";

import type { DigestItem } from "../../content/dashboardContent";
import type { DashboardBriefing } from "../../types/dashboard";
import { DashboardPanel } from "./DashboardPanel";

type SummaryPanelProps = {
  title: string;
  digests: readonly DigestItem[];
  briefing?: DashboardBriefing | null;
  sessionLabel?: string;
  selectedDigestId?: string | null;
  onSelectDigest?: (digest: DigestItem) => void;
  style?: CSSProperties;
};

export function SummaryPanel({
  title,
  digests,
  briefing,
  selectedDigestId,
  onSelectDigest,
  style,
}: SummaryPanelProps) {
  return (
    <DashboardPanel style={style}>
      <div className="mb-2 border-b border-orbit-border pb-2.5">
        <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-orbit-accent">
          Overview
        </p>
        <h2 className="orbit-line-clamp-2 orbit-wrap-anywhere mt-1.5 font-display text-[0.98rem] font-semibold leading-[1.35] tracking-[-0.02em] text-orbit-text">
          {title}
        </h2>
      </div>
      {briefing?.body_en ? (
        <section className="mb-2 border border-orbit-accent/60 bg-orbit-bg-elevated px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
              Today in AI
            </span>
            {briefing.run_meta?.prompt_version ? (
              <span className="inline-flex border border-orbit-border bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
                {briefing.run_meta.prompt_version}
              </span>
            ) : null}
          </div>
          <p className="orbit-wrap-anywhere mt-2 whitespace-pre-line text-[0.72rem] leading-[1.6] text-orbit-text">
            {briefing.body_en}
          </p>
        </section>
      ) : null}
      <div className="grid min-h-0 flex-1 gap-2">
        {digests.map((digest) => {
          const isSelected = selectedDigestId === digest.id;
          return (
            <button
              key={digest.id}
              type="button"
              className={[
                "group min-w-0 border bg-orbit-bg-elevated text-left transition-colors duration-150",
                onSelectDigest
                  ? "cursor-pointer hover:border-orbit-border-strong hover:bg-orbit-panel"
                  : "cursor-default",
                isSelected
                  ? "border-orbit-accent bg-orbit-panel"
                  : "border-orbit-border",
              ].join(" ")}
              onClick={() => onSelectDigest?.(digest)}
            >
              {/* accent bar + header row */}
              <div
                className={[
                  "flex min-w-0 items-center gap-2 border-b px-3 py-2",
                  isSelected
                    ? "border-orbit-accent/40"
                    : "border-orbit-border group-hover:border-orbit-border-strong",
                ].join(" ")}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      "block h-3 w-0.5 shrink-0",
                      isSelected ? "bg-orbit-accent" : "bg-orbit-accent-dim",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
                    {digest.domain}
                  </span>
                </div>
              </div>

              {/* body */}
              <div className="px-3 py-2.5">
                <h3 className="orbit-wrap-anywhere font-display text-[0.84rem] font-semibold leading-[1.42] tracking-[-0.02em] text-orbit-text">
                  {digest.headline}
                </h3>
                <p className="orbit-wrap-anywhere mt-1.5 text-[0.72rem] leading-[1.6] text-orbit-muted">
                  {digest.summary}
                </p>

                {onSelectDigest ? (
                  <p className="mt-2 font-mono text-[0.5rem] uppercase tracking-widest text-orbit-accent-dim opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    expand →
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
