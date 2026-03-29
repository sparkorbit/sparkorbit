import type { CSSProperties, ReactNode } from "react";

import type { DigestItem } from "../../content/dashboardContent";
import type {
  DashboardBriefing,
  DashboardPaperDomainSummary,
  DashboardSourceCountSummary,
  DashboardSummaryLlmState,
} from "../../types/dashboard";
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
  llm: DashboardSummaryLlmState;
  paperDomains: readonly DashboardPaperDomainSummary[];
  sourceCounts: readonly DashboardSourceCountSummary[];
  selectedDigestId?: string | null;
  selectedPaperDomain?: string | null;
  onSelectDigest?: (digest: DigestItem) => void;
  onSelectPaperDomain?: (domain: string | null) => void;
  style?: CSSProperties;
};

function statusTone(status: DashboardSummaryLlmState["status"]) {
  if (status === "ready") {
    return "border-orbit-accent/55 bg-orbit-bg-elevated";
  }
  if (status === "processing") {
    return "border-orbit-accent/30 bg-orbit-bg-elevated";
  }
  return "border-orbit-border bg-orbit-bg-elevated";
}

function statusLabel(status: DashboardSummaryLlmState["status"]) {
  if (status === "ready") {
    return "ready";
  }
  if (status === "processing") {
    return "processing";
  }
  if (status === "error") {
    return "fallback";
  }
  return "off";
}

export function SummaryPanel({
  title,
  digests,
  briefing,
  llm,
  paperDomains,
  sourceCounts,
  selectedPaperDomain,
  onSelectPaperDomain,
  style,
}: SummaryPanelProps) {
  const paperDigest = digests.find((digest) => digest.id === "papers") ?? null;
  const showSourceCounts =
    llm.status === "disabled" || llm.status === "error";

  return (
    <DashboardPanel style={style}>
      <div className="mb-2 border-b border-orbit-border pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-orbit-accent">
            Overview
          </p>
          <div className="flex items-center gap-1.5">
            {llm.modelName ? (
              <span className="inline-flex border border-orbit-border bg-orbit-bg px-2.5 py-1 font-mono text-[0.54rem] uppercase tracking-[0.12em] text-orbit-muted">
                {llm.modelName}
              </span>
            ) : null}
            <span className="inline-flex border border-orbit-border bg-orbit-bg px-2.5 py-1 font-mono text-[0.54rem] uppercase tracking-[0.12em] text-orbit-muted">
              {statusLabel(llm.status)}
            </span>
          </div>
        </div>
        <h2 className="orbit-line-clamp-2 orbit-wrap-anywhere mt-1.5 font-display text-[0.98rem] font-semibold leading-[1.35] tracking-[-0.02em] text-orbit-text">
          {title}
        </h2>
      </div>

      {llm.status === "processing" ? (
        <section className="mb-2 border border-orbit-accent/35 bg-orbit-bg px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <div className="orbit-processing-bar" />
                <div className="orbit-processing-bar orbit-processing-bar--delay-1" />
                <div className="orbit-processing-bar orbit-processing-bar--delay-2" />
              </div>
              <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
                LLM Processing
              </span>
              {llm.stageLabel ? (
                <span className="font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted">
                  — {llm.stageLabel}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {typeof llm.stageProgressPercent === "number" ? (
                <span className="font-mono text-[0.62rem] font-semibold tabular-nums tracking-[0.1em] text-orbit-accent">
                  {llm.stageProgressPercent}%
                </span>
              ) : null}
              {llm.modelName ? (
                <span className="inline-flex border border-orbit-border bg-orbit-bg px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-muted">
                  {llm.modelName}
                </span>
              ) : null}
            </div>
          </div>
          {typeof llm.stageProgressPercent === "number" ? (
            <div className="mt-2 h-1 overflow-hidden border border-orbit-border bg-orbit-bg">
              <div
                className="h-full bg-orbit-accent transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(0, Math.min(llm.stageProgressPercent, 100))}%` }}
              />
            </div>
          ) : (
            <div className="mt-2 h-1 overflow-hidden border border-orbit-border bg-orbit-bg">
              <div className="h-full w-1/4 animate-pulse bg-orbit-accent/40" />
            </div>
          )}
          <p className="mt-1.5 font-mono text-[0.48rem] uppercase tracking-[0.1em] text-orbit-accent-dim">
            a popup will appear when complete.
          </p>
        </section>
      ) : null}

      {llm.status === "ready" ? (
        <section className={`mb-2 border px-3 py-2.5 ${statusTone(llm.status)}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
                Quick Summary
              </span>
              {llm.modelName ? (
                <span className="font-mono text-[0.54rem] uppercase tracking-[0.1em] text-orbit-accent-dim">
                  — generated by {llm.modelName}
                </span>
              ) : null}
            </span>
          </div>
          {briefing?.body_en ? (
            <p className="orbit-wrap-anywhere mt-2 whitespace-pre-line text-[0.72rem] leading-[1.6] text-orbit-text">
              {renderBriefingBody(briefing.body_en)}
            </p>
          ) : null}
        </section>
      ) : null}

      {llm.status === "disabled" || llm.status === "error" ? (
        <section className={`mb-2 border px-3 py-2.5 ${statusTone(llm.status)}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent-dim">
              LLM Summary
            </span>
            <span className="inline-flex border border-orbit-border bg-orbit-bg px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-muted">
              {llm.status === "error" ? "fallback" : "off"}
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-[1.6] text-orbit-muted">
            {llm.message}
          </p>
          {llm.failureCode ? (
            <p className="mt-2 font-mono text-[0.54rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
              error code: {llm.failureCode}
            </p>
          ) : null}
          {llm.failureReportPath ? (
            <p className="orbit-wrap-anywhere mt-1.5 font-mono text-[0.5rem] leading-[1.5] text-orbit-muted">
              saved to {llm.failureReportPath}
            </p>
          ) : null}
        </section>
      ) : null}

      {showSourceCounts ? (
        <section className="mb-2 border border-orbit-border bg-orbit-bg-elevated px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 border-b border-orbit-border pb-2">
            <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent-dim">
              Source Coverage
            </span>
            <span className="font-mono text-[0.48rem] uppercase tracking-[0.12em] text-orbit-muted">
              original curation
            </span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {sourceCounts.map((entry) => (
              <div
                key={entry.category}
                className="border border-orbit-border bg-orbit-bg px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[0.76rem] font-semibold text-orbit-text">
                    {entry.label}
                  </span>
                  <span className="font-mono text-[0.48rem] uppercase tracking-[0.12em] text-orbit-muted">
                    {entry.panelCount} panel{entry.panelCount === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                  {entry.documentCount} item{entry.documentCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {llm.status === "ready" ? (
        <section className="min-h-0 border border-orbit-border bg-orbit-bg-elevated px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 border-b border-orbit-border pb-2">
            <span
              className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em]"
              style={{ color: categoryAccentColor("Paper") }}
            >
              Paper Topics
            </span>
            {selectedPaperDomain ? (
              <button
                type="button"
                className="border border-orbit-border bg-orbit-bg px-2.5 py-1 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                onClick={() => onSelectPaperDomain?.(null)}
              >
                show all papers
              </button>
            ) : null}
          </div>

          {paperDigest ? (
            <div
              className="mt-2 w-full border border-orbit-border px-3 py-2.5"
              style={{
                backgroundColor: `color-mix(in srgb, ${categoryAccentColor("Paper")} 4%, var(--color-orbit-bg))`,
              }}
            >
              <h3 className="orbit-wrap-anywhere font-display text-[0.82rem] font-semibold leading-[1.38] text-orbit-text">
                {paperDigest.headline}
              </h3>
              <p className="orbit-wrap-anywhere mt-1.5 text-[0.72rem] leading-[1.6] text-orbit-muted">
                {paperDigest.summary}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[0.72rem] leading-[1.6] text-orbit-muted">
              No paper summary is available yet.
            </p>
          )}

          {paperDomains.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {paperDomains.map((domain) => {
                const isActive = selectedPaperDomain === domain.key;
                return (
                  <button
                    key={domain.key}
                    type="button"
                    className={[
                      "inline-flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[0.54rem] uppercase tracking-[0.1em] transition-colors duration-150",
                      isActive
                        ? "border-orbit-accent bg-orbit-panel text-orbit-accent"
                        : "border-orbit-border bg-orbit-bg text-orbit-muted hover:border-orbit-accent/60 hover:text-orbit-text",
                    ].join(" ")}
                    onClick={() =>
                      onSelectPaperDomain?.(isActive ? null : domain.key)
                    }
                  >
                    <span>{domain.label}</span>
                    <span className="text-[0.5rem] text-orbit-accent-dim">
                      {domain.count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-[0.72rem] leading-[1.6] text-orbit-muted">
              {llm.filteringReady
                ? "No grouped paper domains are available for this session yet."
                : "Paper topics will appear here after paper grouping finishes."}
            </p>
          )}
        </section>
      ) : null}
    </DashboardPanel>
  );
}
