import type { CSSProperties, ReactNode } from "react";

import type { DigestItem } from "../../content/dashboardContent";
import type { BriefingStatus, DashboardBriefing } from "../../types/dashboard";
import { DashboardPanel } from "./DashboardPanel";
import { categoryAccentColor } from "./styles";

const TAG_COLORS: Record<string, string> = {
  Papers: "var(--color-cat-papers)",
  "Company News": "var(--color-cat-company)",
  Models: "var(--color-cat-models)",
  Community: "var(--color-cat-community)",
  "Model Rankings": "var(--color-cat-benchmark)",
};

function renderBriefingBody(text: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const tagMatch = part.match(/^\[(.+)\]$/);
    if (tagMatch) {
      const label = tagMatch[1];
      const color = TAG_COLORS[label] || "var(--color-orbit-accent-dim)";
      return (
        <span
          key={i}
          className="inline-flex items-center font-mono text-[0.62rem] font-semibold uppercase tracking-[0.12em]"
          style={{ color }}
        >
          [{label}]
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

type SummaryPanelProps = {
  title: string;
  digests: readonly DigestItem[];
  briefing?: DashboardBriefing | null;
  briefingStatus?: BriefingStatus;
  selectedDigestId?: string | null;
  onSelectDigest?: (digest: DigestItem) => void;
  style?: CSSProperties;
};

export function SummaryPanel({
  title,
  digests,
  briefing,
  briefingStatus,
  selectedDigestId,
  onSelectDigest,
  style,
}: SummaryPanelProps) {
  return (
    <DashboardPanel style={style}>
      <div className="mb-2 border-b border-orbit-border pb-2.5">
        <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-orbit-accent">
          Highlights
        </p>
        <h2 className="orbit-line-clamp-2 orbit-wrap-anywhere mt-1.5 font-display text-[0.98rem] font-semibold leading-[1.35] tracking-[-0.02em] text-orbit-text">
          {title}
        </h2>
      </div>
      {briefing?.body_en ? (
        <section className="mb-2 border border-orbit-accent/60 bg-orbit-bg-elevated px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
              Today's Summary
            </span>
            <span className="inline-flex border border-orbit-border bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.44rem] uppercase tracking-widest text-orbit-muted">
              ready
            </span>
          </div>
          <p className="orbit-wrap-anywhere mt-2 whitespace-pre-line text-[0.72rem] leading-[1.6] text-orbit-text">
            {renderBriefingBody(briefing.body_en)}
          </p>
        </section>
      ) : briefingStatus === "processing" ? (
        <section className="mb-2 border border-orbit-accent/30 bg-orbit-bg-elevated px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
              Today's Summary
            </span>
            <span className="inline-flex border border-orbit-border bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.44rem] uppercase tracking-widest text-orbit-muted">
              updating
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-[1.6] text-orbit-muted">
            Updating today's summary. This may take a moment while the latest
            items are being processed.
          </p>
        </section>
      ) : briefingStatus === "error" ? (
        <section className="mb-2 border border-orbit-border bg-orbit-bg-elevated px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent-dim">
              Today's Summary
            </span>
            <span className="inline-flex border border-orbit-border bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.44rem] uppercase tracking-widest text-orbit-muted">
              error
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-[1.6] text-orbit-muted">
            Today's summary could not be prepared. Reload after the local
            summary service is available.
          </p>
        </section>
      ) : briefingStatus === "disabled" ? (
        <section className="mb-2 border border-orbit-border bg-orbit-bg-elevated px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent-dim">
              Today's Summary
            </span>
            <span className="inline-flex border border-orbit-border bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.44rem] uppercase tracking-widest text-orbit-muted">
              off
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-[1.6] text-orbit-muted">
            Today's summary is off. Topic cards below are based on source data.
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
              data-digest-id={digest.id}
              className={[
                "group min-w-0 border text-left transition-colors duration-150",
                onSelectDigest
                  ? "cursor-pointer hover:brightness-110"
                  : "cursor-default",
                isSelected
                  ? "border-orbit-accent"
                  : "border-orbit-border",
              ].join(" ")}
              style={{
                backgroundColor: `color-mix(in srgb, ${categoryAccentColor(digest.domain)} ${isSelected ? "12%" : "5%"}, var(--color-orbit-bg-elevated))`,
              }}
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
                style={{
                  backgroundColor: `color-mix(in srgb, ${categoryAccentColor(digest.domain)} ${isSelected ? "10%" : "4%"}, transparent)`,
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="block h-3 w-0.5 shrink-0"
                    style={{ backgroundColor: categoryAccentColor(digest.domain) }}
                    aria-hidden="true"
                  />
                  <span
                    className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: categoryAccentColor(digest.domain) }}
                  >
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
                    view details →
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
