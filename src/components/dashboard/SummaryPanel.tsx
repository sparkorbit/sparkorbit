import type { CSSProperties } from "react";

import type { DigestItem } from "../../content/dashboardContent";
import type { DashboardBriefing } from "../../types/dashboard";
import { DashboardPanel } from "./DashboardPanel";
import { card } from "./styles";

type SummaryPanelProps = {
  title: string;
  briefing: DashboardBriefing | null;
  digests: readonly DigestItem[];
  sessionLabel: string;
  selectedDigestId?: string | null;
  onSelectDigest?: (digest: DigestItem) => void;
  style?: CSSProperties;
};

export function SummaryPanel({
  title,
  briefing,
  digests,
  sessionLabel,
  selectedDigestId,
  onSelectDigest,
  style,
}: SummaryPanelProps) {
  const promptVersion = briefing?.run_meta?.prompt_version;

  return (
    <DashboardPanel
      eyebrow="요약 레인"
      title={title}
      sessionLabel={sessionLabel}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        {briefing ? (
          <section className={`${card} space-y-2.5 border-orbit-accent/60`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
                Daily Briefing
              </span>
              {promptVersion ? (
                <span className="inline-flex border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.64rem] uppercase leading-[1.4] tracking-[0.12em] text-orbit-text">
                  {promptVersion}
                </span>
              ) : null}
            </div>
            <h3 className="orbit-wrap-anywhere font-display text-[0.9rem] font-semibold leading-[1.42] tracking-[-0.02em] text-orbit-text">
              Today&apos;s Summarization
            </h3>
            <p className="orbit-wrap-anywhere whitespace-pre-line text-[0.74rem] leading-[1.6] text-orbit-text">
              {briefing.body_en}
            </p>
          </section>
        ) : null}
        <div className="grid min-h-0 flex-1 gap-2">
          {digests.map((digest) => (
            <button
              key={digest.id}
              type="button"
              className={[
                `${card} space-y-2 text-left transition-colors duration-150`,
                onSelectDigest
                  ? "hover:border-orbit-border-strong hover:bg-orbit-bg-elevated"
                  : "",
                selectedDigestId === digest.id
                  ? "border-orbit-accent"
                  : "",
              ].join(" ")}
              onClick={() => onSelectDigest?.(digest)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
                  {digest.domain}
                </span>
                <span className="orbit-token-ellipsis inline-flex max-w-[10rem] border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.64rem] uppercase leading-[1.4] tracking-[0.12em] text-orbit-text">
                  {digest.evidence}
                </span>
              </div>
              <h3 className="orbit-wrap-anywhere font-display text-[0.82rem] font-semibold leading-[1.42] tracking-[-0.02em] text-orbit-text">
                {digest.headline}
              </h3>
              <p className="orbit-wrap-anywhere text-[0.72rem] leading-[1.55] text-orbit-text">
                {digest.summary}
              </p>
            </button>
          ))}
        </div>
      </div>
    </DashboardPanel>
  );
}
