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

        <div className="rounded-[1rem] border border-[rgba(85,243,204,0.16)] bg-[linear-gradient(135deg,rgba(12,44,29,0.98),rgba(4,17,10,0.98)_58%,rgba(7,38,26,0.94))] p-3 text-[#eaffef] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="font-display text-[0.67rem] uppercase tracking-[0.18em] text-[rgba(197,255,214,0.7)]">
            근거 기반 프롬프트
          </p>
          <div className="mt-2 space-y-1.5">
            {prompts.map((prompt, index) => (
              <article
                key={prompt.question}
                className="rounded-[0.95rem] border border-[rgba(124,255,155,0.12)] bg-[rgba(4,20,12,0.5)] p-2.5"
              >
                <div className="flex items-start gap-2">
                  <span className="font-display mt-0.5 text-[0.64rem] font-bold tracking-[0.14em] text-[rgba(197,255,214,0.56)]">
                    0{index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-[0.8rem] font-semibold leading-[1.4]">
                      {prompt.question}
                    </h3>
                    <p className="mt-1.5 text-[0.72rem] leading-[1.45] text-[rgba(232,255,238,0.74)]">
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
