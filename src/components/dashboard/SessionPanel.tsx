import type { CSSProperties } from "react";

import type {
  RuntimeItem,
  SessionMetric,
} from "../../content/dashboardContent";
import { DashboardPanel } from "./DashboardPanel";
import { card, pill } from "./styles";

type SessionPanelProps = {
  title: string;
  sessionId: string;
  sessionDate: string;
  window: string;
  reloadRule: string;
  metrics: readonly SessionMetric[];
  runtime: readonly RuntimeItem[];
  rules: readonly string[];
  style?: CSSProperties;
};

const runtimeNameMap: Record<string, { label: string; code?: string }> = {
  collector: { label: "수집기", code: "collector" },
  enricher: { label: "정제기", code: "enricher" },
  redis: { label: "세션 저장소", code: "redis" },
  ui: { label: "화면 레이어", code: "ui" },
};

export function SessionPanel({
  title,
  sessionId,
  sessionDate,
  window,
  reloadRule,
  metrics,
  runtime,
  rules,
  style,
}: SessionPanelProps) {
  return (
    <DashboardPanel
      eyebrow="세션 / 런타임"
      title={title}
      sessionLabel={`${sessionDate} / ${window}`}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <div className={`${card} space-y-2`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-display truncate text-[0.68rem] uppercase tracking-[0.16em] text-orbit-accent-strong">
              {sessionId}
            </p>
            <span className={pill}>활성</span>
          </div>
          <p className="text-[0.75rem] leading-[1.5] text-orbit-muted">
            {reloadRule}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className={`${card} flex flex-col gap-1.5`}
            >
              <div className="flex items-end justify-between gap-2">
                <p className="text-[1.32rem] leading-none tracking-[-0.05em] text-orbit-text">
                  {metric.value}
                </p>
                <p className="font-display text-right text-[0.6rem] font-bold uppercase tracking-[0.14em] text-orbit-accent-strong">
                  {metric.label}
                </p>
              </div>
              <p className="text-[0.7rem] leading-[1.45] text-orbit-muted">
                {metric.note}
              </p>
            </article>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[1.15fr_0.85fr]">
          <div className={`${card} min-h-0 space-y-2 h-fit`}>
            {runtime.map((item) => {
              const runtimeName = runtimeNameMap[item.name] ?? {
                label: item.name,
              };

              return (
                <article
                  key={item.name}
                  className="rounded-[0.95rem] border border-[rgba(124,255,155,0.1)] bg-[rgba(8,29,17,0.82)] p-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <h3 className="font-display text-[0.78rem] font-semibold tracking-[0.02em] text-orbit-text">
                        {runtimeName.label}
                      </h3>
                      {runtimeName.code ? (
                        <p className="mt-0.5 font-display text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted">
                          {runtimeName.code}
                        </p>
                      ) : null}
                    </div>
                    <span className={`${pill} shrink-0 whitespace-nowrap`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-[1.45] text-orbit-muted">
                    {item.role}
                  </p>
                </article>
              );
            })}
          </div>

          <div className={`${card} min-h-0 h-fit`}>
            <p className="font-display mb-2 text-[0.64rem] font-bold uppercase tracking-[0.14em] text-orbit-accent-strong">
              운영 규칙
            </p>
            <div className="flex flex-wrap content-start gap-1.5">
              {rules.map((rule) => (
                <span key={rule} className={pill}>
                  {rule}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardPanel>
  );
}
