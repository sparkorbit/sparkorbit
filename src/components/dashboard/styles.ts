export const shell = "h-full w-full";

export const panel =
  "relative h-full min-h-0 overflow-hidden border border-orbit-border " +
  "bg-orbit-panel p-3 md:p-3.5";

export const label =
  "font-mono text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-orbit-accent";

export const sessionTag =
  "orbit-token-ellipsis inline-flex max-w-[12rem] shrink-0 items-center justify-center border border-orbit-border-strong " +
  "bg-orbit-bg px-1.5 py-0.5 text-center font-mono text-[0.6rem] uppercase leading-[1.35] tracking-[0.12em] text-orbit-text";

export const pill =
  "orbit-token-ellipsis inline-flex max-w-[11rem] items-center justify-center border border-orbit-border " +
  "bg-orbit-bg-elevated px-2 py-1 text-center font-mono text-[0.66rem] uppercase leading-[1.35] tracking-[0.12em] text-orbit-text";

export const card =
  "min-w-0 border border-orbit-border " +
  "bg-orbit-bg-elevated p-2.5";

export const riseIn =
  "h-full opacity-0 animate-[fade-in_0.24s_linear_forwards]";

const CATEGORY_ACCENT_COLORS: Record<string, string> = {
  Papers: "var(--color-cat-papers)",
  Models: "var(--color-cat-models)",
  Company: "var(--color-cat-company)",
  "Company KR": "var(--color-cat-company)",
  "Company CN": "var(--color-cat-company)",
  Community: "var(--color-cat-community)",
  "Model Rankings": "var(--color-cat-benchmark)",
};

export function categoryAccentColor(category: string) {
  return CATEGORY_ACCENT_COLORS[category] || "var(--color-orbit-accent-dim)";
}
