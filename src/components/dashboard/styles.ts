export const shell = "h-full w-full";

export const panel =
  "relative h-full min-h-0 overflow-hidden border border-orbit-border " +
  "bg-orbit-panel p-3 md:p-3.5";

export const riseIn =
  "h-full opacity-0 animate-[fade-in_0.24s_linear_forwards]";

const CATEGORY_ACCENT_COLORS: Record<string, string> = {
  Paper: "var(--color-cat-papers)",
  Papers: "var(--color-cat-papers)",
  Model: "var(--color-cat-models)",
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
