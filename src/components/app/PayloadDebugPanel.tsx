import { useState } from "react";

export type PayloadDebugSnapshot = {
  key: string;
  title: string;
  path: string;
  transport: "http" | "sse";
  receivedAt: string;
  status: string | null;
  sessionId: string | null;
  jsonText: string;
};

function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PayloadDebugPanel({
  snapshots,
  isOpen,
  onToggle,
}: {
  snapshots: PayloadDebugSnapshot[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    snapshots[0]?.key ?? null,
  );
  const selectedSnapshot =
    snapshots.find((snapshot) => snapshot.key === selectedKey) ??
    snapshots[0] ??
    null;

  async function handleCopy() {
    if (!selectedSnapshot || typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedSnapshot.jsonText);
    } catch {
      // Ignore clipboard failures in constrained environments.
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex max-h-[calc(100dvh-2rem)] flex-col items-end gap-2">
      <button
        type="button"
        className={[
          "inline-flex min-h-10 items-center gap-2 border px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] transition-colors duration-150",
          isOpen
            ? "border-orbit-accent bg-orbit-panel text-orbit-accent"
            : "border-orbit-border-strong bg-orbit-bg-elevated text-orbit-text hover:border-orbit-accent hover:text-orbit-accent",
        ].join(" ")}
        onClick={onToggle}
      >
        <span
          aria-hidden="true"
          className="block h-2 w-2 border border-orbit-accent bg-orbit-accent"
        />
        payload tap
        <span className="text-orbit-accent-dim">
          {snapshots.length > 0 ? snapshots.length : "idle"}
        </span>
      </button>

      {isOpen ? (
        <section className="relative flex h-[min(72vh,780px)] w-[min(92vw,1040px)] min-w-[320px] flex-col overflow-hidden border border-orbit-border-strong bg-orbit-bg-elevated shadow-[0_18px_60px_rgb(0_0_0_/_0.45)]">
          <div
            aria-hidden="true"
            className="orbit-grid pointer-events-none absolute inset-0 opacity-15"
          />
          <div
            aria-hidden="true"
            className="orbit-scanlines pointer-events-none absolute inset-0 opacity-15"
          />

          <div className="relative z-10 flex items-start justify-between gap-3 border-b border-orbit-border-strong bg-orbit-bg px-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-orbit-accent">
                payload monitor
              </p>
              <h2 className="mt-2 font-display text-[0.96rem] font-semibold text-orbit-text">
                BFF Response Trace
              </h2>
              <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                dashboard, reload, digest, document, leaderboard 응답의 마지막 payload를 보관합니다.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="border border-orbit-border bg-orbit-panel px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                onClick={() => void handleCopy()}
                disabled={!selectedSnapshot}
              >
                copy
              </button>
              <button
                type="button"
                className="border border-orbit-border bg-orbit-panel px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-orbit-muted transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                onClick={onToggle}
              >
                seal
              </button>
            </div>
          </div>

          <div className="relative z-10 grid min-h-0 flex-1 gap-px bg-orbit-border md:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-auto bg-orbit-bg">
              {snapshots.length > 0 ? (
                <div className="grid gap-px">
                  {snapshots.map((snapshot) => {
                    const isSelected = snapshot.key === selectedSnapshot?.key;
                    return (
                      <button
                        key={snapshot.key}
                        type="button"
                        className={[
                          "border-0 px-4 py-3 text-left transition-colors duration-150",
                          isSelected
                            ? "bg-orbit-panel text-orbit-text"
                            : "bg-orbit-bg-elevated text-orbit-muted hover:bg-orbit-panel hover:text-orbit-text",
                        ].join(" ")}
                        onClick={() => setSelectedKey(snapshot.key)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-orbit-accent">
                            {snapshot.title}
                          </p>
                          <p className="font-mono text-[0.54rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                            {snapshot.transport}
                          </p>
                        </div>
                        <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-orbit-text">
                          {snapshot.path}
                        </p>
                        <div className="mt-3 grid gap-1 text-[0.7rem] leading-[1.55]">
                          <p>
                            status / {snapshot.status ?? "-"}
                          </p>
                          <p className="orbit-wrap-anywhere">
                            session / {snapshot.sessionId ?? "-"}
                          </p>
                          <p className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                            {formatSnapshotTime(snapshot.receivedAt)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-4">
                  <div className="max-w-xs border border-orbit-border bg-orbit-bg-elevated p-4 text-center">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                      trace idle
                    </p>
                    <p className="mt-2 text-[0.74rem] leading-[1.6] text-orbit-muted">
                      아직 기록된 payload가 없습니다. stream이나 detail fetch가 들어오면 여기에 저장됩니다.
                    </p>
                  </div>
                </div>
              )}
            </aside>

            <section className="min-h-0 overflow-auto bg-[#040604] p-4">
              {selectedSnapshot ? (
                <div className="grid min-h-full gap-4">
                  <div className="grid gap-2 border border-orbit-border bg-orbit-bg-elevated p-3 text-[0.72rem] leading-[1.6] text-orbit-muted sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-orbit-accent">
                        lane
                      </p>
                      <p className="mt-1 text-orbit-text">{selectedSnapshot.title}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-orbit-accent">
                        path
                      </p>
                      <p className="orbit-wrap-anywhere mt-1 text-orbit-text">
                        {selectedSnapshot.path}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-orbit-accent">
                        status
                      </p>
                      <p className="mt-1 text-orbit-text">
                        {selectedSnapshot.status ?? "-"}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-orbit-accent">
                        session
                      </p>
                      <p className="orbit-wrap-anywhere mt-1 text-orbit-text">
                        {selectedSnapshot.sessionId ?? "-"}
                      </p>
                    </div>
                  </div>

                  <pre className="min-h-0 flex-1 overflow-auto border border-orbit-border-strong bg-black/70 p-4 font-mono text-[0.7rem] leading-[1.6] text-orbit-text">
                    <code>{selectedSnapshot.jsonText}</code>
                  </pre>
                </div>
              ) : null}
            </section>
          </div>
        </section>
      ) : null}
    </div>
  );
}
