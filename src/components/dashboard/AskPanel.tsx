import type { CSSProperties } from "react";

import type { AskPrompt, ReferenceItem } from "../../content/dashboardContent";
import { DashboardPanel } from "./DashboardPanel";
import { card, pill } from "./styles";

type AskPanelProps = {
  title: string;
  description: string;
  prompts: readonly AskPrompt[];
  references: readonly ReferenceItem[];
  sessionLabel: string;
  style?: CSSProperties;
};

export function AskPanel({
  title,
  description,
  prompts,
  references,
  sessionLabel,
  style,
}: AskPanelProps) {
  return (
    <DashboardPanel
      eyebrow="질문 / 에이전트 레인"
      title={title}
      sessionLabel={sessionLabel}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <p className="text-[0.74rem] leading-[1.48] text-orbit-muted">
          {description}
        </p>

        <div className="border border-orbit-border-strong bg-orbit-bg p-3 text-orbit-text">
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-orbit-accent">
            근거 기반 프롬프트
          </p>
          <div className="mt-2 space-y-1.5">
            {prompts.map((prompt, index) => (
              <article
                key={prompt.question}
                className="border border-orbit-border bg-orbit-panel p-2.5"
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono mt-0.5 text-[0.64rem] font-semibold tracking-[0.16em] text-orbit-accent">
                    0{index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-[0.8rem] font-semibold leading-[1.4]">
                      {prompt.question}
                    </h3>
                    <p className="mt-1.5 text-[0.72rem] leading-[1.45] text-orbit-muted">
                      {prompt.grounding}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
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
