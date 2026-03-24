import type { CSSProperties } from "react";

import type { DigestItem } from "../../content/dashboardContent";
import { DashboardPanel } from "./DashboardPanel";
import { card } from "./styles";

type SummaryPanelProps = {
  title: string;
  headline: string;
  digests: readonly DigestItem[];
  sessionLabel: string;
  selectedDigestId?: string | null;
  onSelectDigest?: (digest: DigestItem) => void;
  style?: CSSProperties;
};

export function SummaryPanel({
  title,
  headline,
  digests,
  sessionLabel,
  selectedDigestId,
  onSelectDigest,
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
        <div className="border border-orbit-border-strong bg-orbit-bg p-3">
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-orbit-accent">
            도메인 다이제스트
          </p>
          <p className="orbit-wrap-anywhere mt-2 text-[0.78rem] leading-[1.65] text-orbit-text">
            {headline}
          </p>
        </div>

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
