import { useEffect } from "react";

import { shell } from "../dashboard/styles";

export function ConsoleHeader({
  title,
  subtitle,
  repoUrl,
  onOpenSettings,
}: {
  title: string;
  subtitle: string;
  repoUrl?: string;
  onOpenSettings: () => void;
}) {
  return (
    <header className="relative z-10 border-b border-orbit-border-strong bg-orbit-bg-elevated">
      <div
        className={`${shell} flex items-center justify-between gap-3 px-3 py-2.5 md:px-4 md:py-3`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="block h-2 w-2 shrink-0 border border-orbit-accent bg-orbit-accent"
          />
          <div className="min-w-0">
            <p className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-orbit-accent">
              live dashboard
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="orbit-wrap-anywhere min-w-0 font-display text-[0.9rem] font-semibold text-orbit-text">
                {title}
              </h1>
              <span className="orbit-token-ellipsis hidden max-w-[14rem] border border-orbit-border bg-orbit-panel px-1.5 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.16em] text-orbit-text sm:inline-flex">
                {subtitle}
              </span>
              {repoUrl ? (
                <div className="hidden items-center gap-2 sm:flex">
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 border border-orbit-accent/40 px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-accent transition-colors duration-150 hover:border-orbit-accent hover:bg-orbit-accent/10"
                  >
                    open source
                  </a>
                  <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                    join us
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="settings"
          title="settings"
          className="group inline-flex h-9 shrink-0 items-center justify-center border border-orbit-border-strong bg-orbit-panel px-3 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:border-orbit-accent hover:bg-orbit-bg hover:text-orbit-text"
          onClick={onOpenSettings}
        >
          setup
        </button>
      </div>
    </header>
  );
}

export function SettingsModal({
  isOpen,
  llmStatus,
  llmModelName,
  onClose,
  onRestoreDefaults,
}: {
  isOpen: boolean;
  llmStatus?: string | null;
  llmModelName?: string | null;
  onClose: () => void;
  onRestoreDefaults: () => void;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-orbit-bg/80 p-3 md:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(760px,92vh)] w-full max-w-3xl flex-col overflow-hidden border border-orbit-border-strong bg-orbit-bg-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="orbit-grid pointer-events-none absolute inset-0 opacity-20"
        />
        <div
          aria-hidden="true"
          className="orbit-scanlines pointer-events-none absolute inset-0 opacity-20"
        />

        <div className="relative z-10 border-b border-orbit-border-strong bg-orbit-bg px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-orbit-accent">
                settings
              </p>
              <h2 className="mt-2 font-display text-[1rem] font-semibold text-orbit-text">
                Display Settings
              </h2>
              <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                Display settings are saved to local cache and applied to the grid immediately.
              </p>
            </div>

            <button
              type="button"
              className="shrink-0 border border-orbit-border bg-orbit-panel px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
              onClick={onClose}
            >
              close
            </button>
          </div>
        </div>

        <div className="relative z-10 min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,1fr)]">
            <section className="space-y-3 border border-orbit-border bg-orbit-bg-elevated p-3">
              <div className="border-b border-orbit-border pb-3">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-orbit-accent">
                  LLM Provider
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  AI briefing and category summaries powered by a local LLM.
                </p>
              </div>

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                    Status
                  </p>
                  <div className="flex items-center gap-2">
                    {llmModelName ? (
                      <span className="inline-flex border border-orbit-border bg-orbit-bg-elevated px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-orbit-muted">
                        {llmModelName}
                      </span>
                    ) : null}
                    <span
                      className={[
                        "inline-flex border px-2 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.14em]",
                        llmStatus === "ready"
                          ? "border-orbit-accent bg-orbit-panel text-orbit-accent"
                          : llmStatus === "processing"
                            ? "border-orbit-accent/40 bg-orbit-panel text-orbit-accent-dim"
                            : llmStatus === "error"
                              ? "border-red-600/40 bg-orbit-panel text-red-400"
                              : "border-orbit-border bg-orbit-bg-elevated text-orbit-muted",
                      ].join(" ")}
                    >
                      {llmStatus === "ready"
                      ? "active"
                      : llmStatus === "processing"
                        ? "processing"
                        : llmStatus === "error"
                          ? "error"
                          : "off"}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  {llmStatus === "ready"
                    ? "Local LLM summary and paper grouping are active for this session."
                    : llmStatus === "processing"
                      ? "The local LLM is still preparing the summary and paper grouping. Original source curation stays visible until it finishes."
                      : llmStatus === "error"
                        ? "The local LLM did not finish cleanly. Check Ollama and confirm the model download completed."
                        : "Local LLM is off. The monitor is using original source data only."}
                </p>
                {llmStatus === "disabled" || !llmStatus ? (
                  <div className="mt-3 border border-orbit-border bg-orbit-bg-elevated px-3 py-2">
                    <p className="font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                      to enable
                    </p>
                    <p className="mt-1 font-mono text-[0.64rem] leading-[1.6] text-orbit-text">
                      npm run docker:up:llm
                    </p>
                    <p className="mt-1 text-[0.68rem] leading-[1.6] text-orbit-muted">
                      Start the stack with the local LLM bundle so Ollama, paper grouping,
                      and briefing generation run together.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-3 border border-orbit-border bg-orbit-bg-elevated p-3">
              <div className="border-b border-orbit-border pb-3">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Default
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  Return the workspace to its first-load state.
                </p>
              </div>

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Reset Everything
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  Clear saved panel layout and restore the original default settings in one step.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg"
                  onClick={onRestoreDefaults}
                >
                  set default
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GitHubStarPrompt({
  isOpen,
  signalLevel,
  onAccept,
  onLater,
  onDismissForever,
}: {
  isOpen: boolean;
  signalLevel: number;
  onAccept: () => void;
  onLater: () => void;
  onDismissForever: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[72] sm:left-auto sm:w-[24rem]">
      <aside className="orbit-hacker-reveal pointer-events-auto relative overflow-hidden border border-orbit-border-strong bg-orbit-bg-elevated shadow-[0_14px_42px_rgba(0,0,0,0.34)]">
        <div
          aria-hidden="true"
          className="orbit-grid pointer-events-none absolute inset-0 opacity-15"
        />
        <div
          aria-hidden="true"
          className="orbit-scanlines pointer-events-none absolute inset-0 opacity-10"
        />

        <div className="orbit-hacker-reveal__content relative z-10">
          <div className="border-b border-orbit-border-strong bg-orbit-bg px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex border border-orbit-accent/50 bg-orbit-panel px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.16em] text-orbit-accent">
                3m online
              </span>
              <span className="font-mono text-[0.54rem] uppercase tracking-[0.16em] text-orbit-accent-dim">
                repo ping / 저장소 알림
              </span>
            </div>
            <p className="mt-2 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-orbit-accent-dim">
              more observers wanted / 관측 동료 모집중
            </p>

            <h2 className="mt-2 font-display text-[0.98rem] font-semibold text-orbit-text">
              You&apos;ve been orbiting for three minutes.
            </h2>
            <p className="mt-1 font-display text-[0.84rem] font-medium text-orbit-accent-dim">
              3분 정도 둘러보셨네요.
            </p>
            <p className="mt-2 text-[0.76rem] leading-[1.62] text-orbit-muted">
              Bring more observers into the orbit.
            </p>
            <p className="mt-1 text-[0.74rem] leading-[1.62] text-orbit-muted">
              더 많은 사람들이 이 관측 궤도에 함께할 수 있도록 도와주세요.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-orbit-accent-dim">
                signal
              </span>
              <div className="h-1.5 flex-1 overflow-hidden border border-orbit-border bg-orbit-panel">
                <div
                  className="h-full bg-[linear-gradient(90deg,var(--color-orbit-accent),rgba(141,252,84,0.35))] transition-[width] duration-100 linear"
                  style={{
                    width: `${Math.max(0, Math.min(signalLevel, 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <button
              type="button"
              className="inline-flex border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg"
              onClick={onAccept}
            >
              open repo / GitHub 열기
            </button>
            <button
              type="button"
              className="inline-flex border border-orbit-border bg-orbit-bg px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted transition-colors duration-150 hover:border-orbit-border-strong hover:text-orbit-text"
              onClick={onLater}
            >
              later / 나중에
            </button>
            <button
              type="button"
              className="inline-flex border border-orbit-border bg-orbit-bg px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-muted transition-colors duration-150 hover:border-orbit-border-strong hover:text-orbit-text"
              onClick={onDismissForever}
            >
              mute this / 다시 보지 않기
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function LlmReadyNotice({
  isOpen,
  modelName,
  onConfirm,
}: {
  isOpen: boolean;
  modelName?: string | null;
  onConfirm: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[78] flex items-center justify-center bg-orbit-bg/72 p-4">
      <aside className="orbit-hacker-reveal pointer-events-auto relative w-full max-w-md overflow-hidden border border-orbit-border-strong bg-orbit-bg-elevated shadow-[0_18px_48px_rgba(0,0,0,0.4)]">
        <div
          aria-hidden="true"
          className="orbit-grid pointer-events-none absolute inset-0 opacity-15"
        />
        <div
          aria-hidden="true"
          className="orbit-scanlines pointer-events-none absolute inset-0 opacity-10"
        />

        <div className="orbit-hacker-reveal__content relative z-10">
          <div className="border-b border-orbit-border-strong bg-orbit-bg px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex border border-orbit-accent/50 bg-orbit-panel px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.16em] text-orbit-accent">
                LLM ready
              </span>
              {modelName ? (
                <span className="inline-flex border border-orbit-border bg-orbit-bg px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-muted">
                  {modelName}
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 font-display text-[1rem] font-semibold text-orbit-text">
              Summarization and filtering are ready.
            </h2>
            <p className="mt-2 text-[0.76rem] leading-[1.62] text-orbit-muted">
              The overview now includes the LLM summary and grouped paper topics.
            </p>
          </div>

          <div className="px-4 py-3">
            <button
              type="button"
              className="inline-flex border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg"
              onClick={onConfirm}
            >
              check
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
