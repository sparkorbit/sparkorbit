import type { CSSProperties, ReactNode } from "react";

import { panel, riseIn } from "./styles";

type DashboardPanelProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export function DashboardPanel({ children, style }: DashboardPanelProps) {
  return (
    <section className={`${panel} ${riseIn} flex flex-col`} style={style}>
      <div className="orbit-scrollbar-hidden min-h-0 flex-1 overflow-y-auto pr-1">
        {children}
      </div>
    </section>
  );
}
