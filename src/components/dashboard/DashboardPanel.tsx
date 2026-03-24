import type { CSSProperties, ReactNode } from "react";

import { label, panel, riseIn, sessionTag } from "./styles";

type DashboardPanelProps = {
  eyebrow: string;
  title: string;
  sessionLabel: string;
  children: ReactNode;
  style?: CSSProperties;
};

export function DashboardPanel({
  eyebrow,
  title,
  sessionLabel,
  children,
  style,
}: DashboardPanelProps) {
  return (
    <section className={`${panel} ${riseIn} flex flex-col`} style={style}>
      <div className="flex items-start justify-between gap-2 border-b border-orbit-border pb-3">
        <div className="min-w-0 flex-1">
          <p className={label}>{eyebrow}</p>
          <h2 className="font-display mt-2 truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-orbit-text">
            {title}
          </h2>
        </div>
        <span className={sessionTag}>{sessionLabel}</span>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
    </section>
  );
}
