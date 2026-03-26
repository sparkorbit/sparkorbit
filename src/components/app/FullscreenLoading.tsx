import type { JobProgressSnapshot } from "../../types/jobProgress";

type FullscreenLoadingProps = {
  progress: JobProgressSnapshot;
  visible: boolean;
};

export function FullscreenLoading({
  progress,
  visible,
}: FullscreenLoadingProps) {
  if (!visible) {
    return null;
  }

  const progressWidth = `${Math.max(0, Math.min(progress.percent, 100))}%`;
  const stageLabel = progress.stage_label || "Preparing";
  const detail = progress.detail || "";
  const visibleSteps = progress.steps.filter(
    (step) => !["summaries", "labels", "briefing"].includes(step.id),
  );
  const activeSteps = progress.steps.filter(
    (s) => s.status === "active" || s.status === "complete",
  );

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-orbit-bg/95 backdrop-blur-[2px]">
      <div className="w-full max-w-md px-8">
        <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
          {stageLabel}
        </p>

        {detail ? (
          <p className="mt-1.5 text-[0.64rem] leading-[1.5] text-orbit-muted">
            {detail}
          </p>
        ) : null}

        <div className="mt-3 h-1 overflow-hidden border border-orbit-border bg-orbit-bg">
          <div
            className="h-full bg-orbit-accent transition-[width] duration-300"
            style={{ width: progressWidth }}
          />
        </div>

        {visibleSteps.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {visibleSteps.map((step) => (
              <span
                key={step.id}
                className={[
                  "border px-2 py-0.5 font-mono text-[0.48rem] uppercase tracking-[0.1em] transition-colors duration-200",
                  step.status === "complete"
                    ? "border-orbit-accent/40 text-orbit-accent"
                    : step.status === "active"
                      ? "border-orbit-accent bg-orbit-accent/10 text-orbit-accent"
                      : step.status === "error"
                        ? "border-red-500/40 text-red-400"
                        : "border-orbit-border text-orbit-muted/50",
                ].join(" ")}
              >
                {step.label}
              </span>
            ))}
          </div>
        ) : null}

        {activeSteps.length > 0 && progress.current_work_item ? (
          <p className="mt-3 font-mono text-[0.48rem] uppercase tracking-[0.1em] text-orbit-accent-dim">
            {progress.current_work_item.label}
          </p>
        ) : null}

        <div className="mt-4 flex justify-center gap-1">
          <span className="orbit-processing-bar" />
          <span className="orbit-processing-bar orbit-processing-bar--delay-1" />
          <span className="orbit-processing-bar orbit-processing-bar--delay-2" />
        </div>
      </div>
    </div>
  );
}
