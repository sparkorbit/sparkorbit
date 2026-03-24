import type { CSSProperties } from "react";

import type { DigestItem } from "../../content/dashboardContent";
import { DashboardPanel } from "./DashboardPanel";
import { card } from "./styles";

type SummaryPanelProps = {
  title: string;
  headline: string;
  digests: readonly DigestItem[];
  sessionLabel: string;
  style?: CSSProperties;
};

export function SummaryPanel({
  title,
  headline,
  digests,
  sessionLabel,
  style,
}: SummaryPanelProps) {
  return (
    <DashboardPanel
      eyebrow="요약 레인"
      title={title}
      sessionLabel={sessionLabel}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <div className="rounded-[1rem] border border-[rgba(85,243,204,0.16)] bg-[linear-gradient(135deg,rgba(12,44,29,0.98),rgba(4,17,10,0.98)_58%,rgba(7,38,26,0.94))] p-3 text-[#eaffef] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="font-display text-[0.67rem] uppercase tracking-[0.18em] text-[rgba(197,255,214,0.7)]">
            도메인 다이제스트
          </p>
          <p className="mt-2 text-[0.78rem] leading-[1.5] text-[rgba(234,255,239,0.86)]">
            {headline}
          </p>
        </div>

        <div className="grid min-h-0 flex-1 gap-2">
          {digests.map((digest) => (
            <article key={digest.domain} className={`${card} space-y-2`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-orbit-accent-strong">
                  {digest.domain}
                </span>
                <span className="rounded-full border border-[rgba(124,255,155,0.14)] bg-[rgba(124,255,155,0.08)] px-2 py-1 text-[0.66rem] leading-none text-orbit-accent">
                  {digest.evidence}
                </span>
              </div>
              <h3 className="font-display text-[0.82rem] font-semibold leading-[1.42] tracking-[-0.02em] text-orbit-text">
                {digest.headline}
              </h3>
              <p className="text-[0.72rem] leading-[1.48] text-orbit-muted">
                {digest.summary}
              </p>
            </article>
          ))}
        </div>
      </div>
    </DashboardPanel>
  );
}
