import type { JobProgressSnapshot } from "../../types/jobProgress";

type FullscreenLoadingProps = {
  progress: JobProgressSnapshot;
  visible: boolean;
};

function formatCountLine(
  completed: number,
  total: number,
  extra?: string,
) {
  const core = `${completed}/${total}`;
  return extra ? `${core} ${extra}` : core;
}

export function FullscreenLoading({
  progress,
  visible,
}: FullscreenLoadingProps) {
  if (!visible) {
    return null;
  }

  const currentItem = progress.current_work_item;
  const showSourceLabels = currentItem?.kind === "source";
  const progressWidth = `${Math.max(0, Math.min(progress.percent, 100))}%`;
  const errorMessage = progress.error?.message ?? null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex min-h-0 flex-col bg-orbit-bg/95 backdrop-blur-[2px]">
      <div className="orbit-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div
        className="orbit-scanlines absolute inset-0 opacity-35"
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-4 md:p-8">
        <section className="flex w-full max-w-6xl flex-col border border-orbit-border-strong bg-orbit-panel shadow-[0_0_0_1px_rgba(141,252,84,0.08),0_18px_60px_rgba(0,0,0,0.38)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border px-4 py-4 md:px-6">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
                Live Collection
              </p>
              <h2 className="mt-2 font-display text-[1.12rem] font-semibold text-orbit-text md:text-[1.35rem]">
                {progress.stage_label}
              </h2>
              <p className="mt-1 max-w-3xl text-[0.86rem] leading-6 text-orbit-muted">
                {progress.detail}
              </p>
            </div>

            <div className="shrink-0 border border-orbit-border bg-orbit-bg px-3 py-2">
              <p className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-orbit-muted">
                progress
              </p>
              <p className="mt-1 font-mono text-[1.05rem] font-semibold tabular-nums text-orbit-accent">
                {progress.percent}%
              </p>
            </div>
          </div>

          <div className="border-b border-orbit-border px-4 py-3 md:px-6">
            <div className="h-2 overflow-hidden border border-orbit-border bg-orbit-bg">
              <div
                className="h-full bg-orbit-accent transition-[width] duration-300"
                style={{ width: progressWidth }}
              />
            </div>
          </div>

          <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
            <div className="border-b border-orbit-border p-4 md:border-b-0 md:border-r md:p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <article className="border border-orbit-border bg-orbit-bg px-3 py-3">
                  <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-orbit-muted">
                    sources
                  </p>
                  <p className="mt-2 font-mono text-[0.84rem] text-orbit-text">
                    {formatCountLine(
                      progress.source_counts.completed,
                      progress.source_counts.total,
                      `active ${progress.source_counts.active} / err ${progress.source_counts.error} / skip ${progress.source_counts.skipped}`,
                    )}
                  </p>
                </article>

                <article className="border border-orbit-border bg-orbit-bg px-3 py-3">
                  <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-orbit-muted">
                    documents
                  </p>
                  <p className="mt-2 font-mono text-[0.84rem] text-orbit-text">
                    {formatCountLine(
                      progress.document_counts.completed,
                      progress.document_counts.total,
                      `err ${progress.document_counts.error}`,
                    )}
                  </p>
                </article>

                <article className="border border-orbit-border bg-orbit-bg px-3 py-3">
                  <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-orbit-muted">
                    tasks
                  </p>
                  <p className="mt-2 font-mono text-[0.84rem] text-orbit-text">
                    {formatCountLine(
                      progress.task_counts.completed,
                      progress.task_counts.total,
                      `err ${progress.task_counts.error}`,
                    )}
                  </p>
                </article>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
                <article className="border border-orbit-border bg-orbit-bg px-3 py-3">
                  <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-orbit-muted">
                    {showSourceLabels ? "current source" : "current work"}
                  </p>
                  <p className="mt-2 text-[0.9rem] text-orbit-text">
                    {currentItem?.label ?? "Waiting for next task."}
                  </p>
                </article>

                <article className="border border-orbit-border bg-orbit-bg px-3 py-3">
                  <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-orbit-muted">
                    {showSourceLabels ? "active sources" : "active items"}
                  </p>
                  {progress.active_work_items.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {progress.active_work_items.map((item) => (
                        <span
                          key={`${item.kind}:${item.id}`}
                          className="inline-flex border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.12em] text-orbit-text"
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[0.82rem] text-orbit-muted">
                      No parallel work items are active right now.
                    </p>
                  )}
                </article>
              </div>

              <article className="mt-4 border border-orbit-border bg-orbit-bg px-3 py-3">
                <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-orbit-muted">
                  recent completions
                </p>
                {progress.recent_completed_items.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {progress.recent_completed_items.map((item) => (
                      <span
                        key={`${item.kind}:${item.id}`}
                        className="inline-flex border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.12em] text-orbit-muted"
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[0.82rem] text-orbit-muted">
                    Completed items will appear here as the run advances.
                  </p>
                )}
              </article>

              {errorMessage ? (
                <article className="mt-4 border border-red-900/80 bg-red-950/30 px-3 py-3">
                  <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-red-200">
                    last error
                  </p>
                  <p className="mt-2 text-[0.84rem] leading-6 text-red-100">
                    {errorMessage}
                  </p>
                </article>
              ) : null}
            </div>

            <div className="p-4 md:p-6">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-orbit-accent">
                Step Rail
              </p>
              <div className="mt-3 grid gap-2">
                {progress.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={[
                      "flex items-center gap-3 border px-3 py-2.5",
                      step.status === "active"
                        ? "border-orbit-accent bg-orbit-bg"
                        : step.status === "complete"
                          ? "border-orbit-border-strong bg-orbit-bg"
                          : step.status === "error"
                            ? "border-red-900/80 bg-red-950/25"
                            : "border-orbit-border bg-orbit-panel",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex min-w-[2.1rem] justify-center border px-2 py-1 font-mono text-[0.52rem] uppercase tracking-[0.14em]",
                        step.status === "active"
                          ? "border-orbit-accent text-orbit-accent"
                          : step.status === "complete"
                            ? "border-orbit-border-strong text-orbit-text"
                            : step.status === "error"
                              ? "border-red-800 text-red-100"
                              : "border-orbit-border text-orbit-muted",
                      ].join(" ")}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-orbit-muted">
                        {step.id}
                      </p>
                      <p className="mt-1 text-[0.86rem] text-orbit-text">
                        {step.label}
                      </p>
                    </div>
                    <span
                      className={[
                        "shrink-0 font-mono text-[0.52rem] uppercase tracking-[0.16em]",
                        step.status === "active"
                          ? "text-orbit-accent"
                          : step.status === "complete"
                            ? "text-orbit-text"
                            : step.status === "error"
                              ? "text-red-100"
                              : "text-orbit-muted",
                      ].join(" ")}
                    >
                      {step.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
