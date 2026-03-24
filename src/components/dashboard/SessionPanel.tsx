import type { CSSProperties } from "react";

import type {
  RuntimeItem,
  SessionMetric,
} from "../../content/dashboardContent";
import type { DashboardLoading, LoadingStepStatus } from "../../types/dashboard";
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
  loading: DashboardLoading | null;
  style?: CSSProperties;
};

const runtimeNameMap: Record<string, { label: string; code?: string }> = {
  collector: { label: "수집기", code: "collector" },
  enricher: { label: "정제기", code: "enricher" },
  redis: { label: "세션 저장소", code: "redis" },
  ui: { label: "화면 레이어", code: "ui" },
};

function buildCompactSessionLabel(sessionDate: string, windowLabel: string) {
  const compactDate =
    sessionDate.length >= 10
      ? sessionDate.slice(5).replace("-", ".")
      : sessionDate;
  return `${compactDate} / ${windowLabel}`;
}

export function SessionPanel({
  title,
  sessionId,
  sessionDate,
  window,
  reloadRule,
  metrics,
  runtime,
  rules,
  loading,
  style,
}: SessionPanelProps) {
  function toneForStep(status: LoadingStepStatus) {
    if (status === "complete") {
      return "border-orbit-accent bg-orbit-panel text-orbit-accent";
    }
    if (status === "active") {
      return "border-orbit-text bg-orbit-bg text-orbit-text";
    }
    if (status === "error") {
      return "border-orbit-border-strong bg-orbit-bg text-orbit-text";
    }
    return "border-orbit-border bg-orbit-bg-elevated text-orbit-muted";
  }

  return (
    <DashboardPanel
      eyebrow="세션 / 런타임"
      title={title}
      sessionLabel={buildCompactSessionLabel(sessionDate, window)}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <div className={`${card} space-y-2`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono truncate text-[0.66rem] uppercase tracking-[0.18em] text-orbit-accent">
              {sessionId}
            </p>
            <span className={pill}>활성</span>
          </div>
          <p className="text-[0.75rem] leading-[1.5] text-orbit-muted">
            {reloadRule}
          </p>
        </div>

        {loading ? (
          <section className={`${card} space-y-3`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                  Loading Stage
                </p>
                <h3 className="mt-2 font-display text-[0.9rem] font-semibold text-orbit-text">
                  {loading.stageLabel}
                </h3>
                <p className="mt-2 text-[0.72rem] leading-[1.55] text-orbit-muted">
                  {loading.detail}
                </p>
                {loading.currentSource ? (
                  <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-accent-dim">
                    current source / {loading.currentSource}
                  </p>
                ) : null}
              </div>
              <span className={pill}>{loading.percent}%</span>
            </div>

            <div className="h-2 border border-orbit-border bg-orbit-bg">
              <div
                className="h-full bg-orbit-accent transition-[width] duration-300 ease-out"
                style={{ width: `${loading.percent}%` }}
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {loading.steps.map((step) => (
                <article
                  key={step.id}
                  className={`border p-2 ${toneForStep(step.status)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em]">
                      {step.label}
                    </p>
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em]">
                      {step.status}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.7rem] leading-[1.45]">
                    {step.detail}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className={`${card} flex flex-col gap-1.5`}
            >
              <div className="flex items-end justify-between gap-2">
                <p className="font-mono text-[1.28rem] leading-none tracking-[-0.04em] text-orbit-text">
                  {metric.value}
                </p>
                <p className="font-mono text-right text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-orbit-accent">
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
                  className="border border-orbit-border bg-orbit-panel p-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <h3 className="font-display text-[0.78rem] font-semibold tracking-[0.02em] text-orbit-text">
                        {runtimeName.label}
                      </h3>
                      {runtimeName.code ? (
                        <p className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted">
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
            <p className="font-mono mb-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-orbit-accent">
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
