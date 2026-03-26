import { useEffect } from "react";

import { shell } from "../dashboard/styles";
import {
  ROW_HEIGHT_MODE_OPTIONS,
  type UiSettings,
} from "../../features/dashboard/uiSettings";

function SettingsGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v3.1M12 17.4v3.1M20.5 12h-3.1M6.6 12H3.5M17.95 6.05l-2.2 2.2M8.25 15.75l-2.2 2.2M17.95 17.95l-2.2-2.2M8.25 8.25l-2.2-2.2" />
      <path d="M9.2 3.5h5.6M9.2 20.5h5.6M20.5 9.2v5.6M3.5 9.2v5.6" />
    </svg>
  );
}

function SettingsToggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-3 border border-orbit-border bg-orbit-bg p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
          {label}
        </p>
        <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
          {description}
        </p>
      </div>
      <button
        type="button"
        aria-pressed={enabled}
        className={[
          "inline-flex h-9 min-w-[92px] items-center justify-center border px-3 font-mono text-[0.66rem] uppercase tracking-[0.14em] transition-colors duration-150",
          enabled
            ? "border-orbit-accent bg-orbit-panel text-orbit-accent"
            : "border-orbit-border bg-orbit-bg-elevated text-orbit-muted hover:border-orbit-border-strong hover:text-orbit-text",
        ].join(" ")}
        onClick={onToggle}
      >
        {enabled ? "armed" : "sleep"}
      </button>
    </div>
  );
}


export function ConsoleHeader({
  title,
  subtitle,
  onOpenSettings,
}: {
  title: string;
  subtitle: string;
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
              relay header
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="orbit-wrap-anywhere min-w-0 font-display text-[0.9rem] font-semibold text-orbit-text">
                {title}
              </h1>
              <span className="orbit-token-ellipsis hidden max-w-[14rem] border border-orbit-border bg-orbit-panel px-1.5 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.16em] text-orbit-text sm:inline-flex">
                {subtitle}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="console"
          title="console"
          className="group inline-flex h-9 w-9 shrink-0 items-center justify-center border border-orbit-border-strong bg-orbit-panel font-mono text-orbit-accent transition-colors duration-150 hover:border-orbit-accent hover:bg-orbit-bg hover:text-orbit-text"
          onClick={onOpenSettings}
        >
          <SettingsGlyph />
        </button>
      </div>
    </header>
  );
}

export function SettingsModal({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
  onResetWorkspace,
  onRestoreDefaults,
}: {
  isOpen: boolean;
  settings: UiSettings;
  onClose: () => void;
  onUpdateSettings: (next: UiSettings) => void;
  onResetWorkspace: () => void;
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
                console flags
              </p>
              <h2 className="mt-2 font-display text-[1rem] font-semibold text-orbit-text">
                Operator Console
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
              seal
            </button>
          </div>
        </div>

        <div className="relative z-10 min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <section className="space-y-3 border border-orbit-border bg-orbit-bg-elevated p-3">
              <div className="border-b border-orbit-border pb-3">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Signal Mask
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  Control visual noise and density.
                </p>
              </div>

              <SettingsToggle
                label="Motion Layer"
                description="Toggle trace card reveal and boot motion."
                enabled={settings.motionEnabled}
                onToggle={() =>
                  onUpdateSettings({
                    ...settings,
                    motionEnabled: !settings.motionEnabled,
                  })
                }
              />

              <SettingsToggle
                label="Grid Veil"
                description="Show background grid and scanline veil. Useful for reducing decoration while keeping density."
                enabled={settings.overlaysEnabled}
                onToggle={() =>
                  onUpdateSettings({
                    ...settings,
                    overlaysEnabled: !settings.overlaysEnabled,
                  })
                }
              />

              <SettingsToggle
                label="Payload Tap"
                description="Inspect raw dashboard, reload, and detail payloads from BFF in the bottom-right trace panel."
                enabled={settings.payloadDebugEnabled}
                onToggle={() =>
                  onUpdateSettings({
                    ...settings,
                    payloadDebugEnabled: !settings.payloadDebugEnabled,
                  })
                }
              />

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Row Span
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  Adjust density and drag response by changing row span.
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {ROW_HEIGHT_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={[
                        "border px-3 py-3 text-left transition-colors duration-150",
                        settings.rowHeightMode === option.id
                          ? "border-orbit-accent bg-orbit-panel"
                          : "border-orbit-border bg-orbit-bg-elevated hover:border-orbit-border-strong",
                      ].join(" ")}
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          rowHeightMode: option.id,
                        })
                      }
                    >
                      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                        {option.label}
                      </p>
                      <p className="mt-2 font-display text-[0.82rem] font-semibold text-orbit-text">
                        {option.note}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3 border border-orbit-border bg-orbit-bg-elevated p-3">
              <div className="border-b border-orbit-border pb-3">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Grid Tools
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  Clear saved slot map or revert to baseline loadout.
                </p>
              </div>

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Slot Reset
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  Clear drag order and column/row span cache, then re-sort to recommended layout.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex border border-orbit-border-strong bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                  onClick={onResetWorkspace}
                >
                  flush slot map
                </button>
              </div>

              <div className="border border-orbit-border bg-orbit-bg p-3">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-orbit-accent">
                  Baseline Loadout
                </p>
                <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                  Restore motion on, grid veil on, row span stock defaults and clear saved slot map.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex border border-orbit-accent bg-orbit-panel px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-orbit-accent transition-colors duration-150 hover:bg-orbit-bg"
                  onClick={onRestoreDefaults}
                >
                  restore baseline
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
