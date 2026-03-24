import type { CSSProperties } from "react";

import type {
  EvidenceStep,
  ReferenceItem,
} from "../../content/dashboardContent";
import { DashboardPanel } from "./DashboardPanel";
import { card, pill } from "./styles";

type EvidencePanelProps = {
  title: string;
  description: string;
  steps: readonly EvidenceStep[];
  references: readonly ReferenceItem[];
  sessionLabel: string;
  style?: CSSProperties;
};

export function EvidencePanel({
  title,
  description,
  steps,
  references,
  sessionLabel,
  style,
}: EvidencePanelProps) {
  return (
    <DashboardPanel
      eyebrow="드릴다운 / 근거"
      title={title}
      sessionLabel={sessionLabel}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <p className="text-[0.74rem] leading-[1.48] text-orbit-muted">
          {description}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {steps.map((step) => (
            <article key={step.step} className={`${card} space-y-1.5`}>
              <div className="flex items-center justify-between gap-2">
                <span className="border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.64rem] uppercase tracking-[0.12em] text-orbit-accent">
                  {step.step}
                </span>
                <span className={pill}>{step.title}</span>
              </div>
              <p className="text-[0.72rem] leading-[1.45] text-orbit-muted">
                {step.detail}
              </p>
            </article>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 gap-2">
          {references.map((reference) => (
            <article key={reference.title} className={`${card} space-y-1.5`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={pill}>{reference.source}</span>
              </div>
              <h3 className="font-display text-[0.8rem] font-semibold leading-[1.42] tracking-[-0.02em] text-orbit-text">
                {reference.title}
              </h3>
              <p className="text-[0.72rem] leading-[1.48] text-orbit-muted">
                {reference.note}
              </p>
            </article>
          ))}
        </div>
      </div>
    </DashboardPanel>
  );
}
