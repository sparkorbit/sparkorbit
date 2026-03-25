export type RowHeightMode = "compact" | "standard" | "tall";

export type UiSettings = {
  motionEnabled: boolean;
  overlaysEnabled: boolean;
  rowHeightMode: RowHeightMode;
};

export const UI_SETTINGS_STORAGE_KEY = "sparkorbit-ui-settings-v1";

export const ROW_HEIGHT_MODE_OPTIONS: Array<{
  id: RowHeightMode;
  label: string;
  note: string;
  rowHeightPx: number;
}> = [
  {
    id: "compact",
    label: "Tight",
    note: "row span 260px",
    rowHeightPx: 260,
  },
  {
    id: "standard",
    label: "Stock",
    note: "row span 320px",
    rowHeightPx: 320,
  },
  {
    id: "tall",
    label: "Deep",
    note: "row span 380px",
    rowHeightPx: 380,
  },
] as const;

export const DEFAULT_UI_SETTINGS: UiSettings = {
  motionEnabled: true,
  overlaysEnabled: true,
  rowHeightMode: "standard",
};

export function loadUiSettings(): UiSettings {
  if (typeof window === "undefined") {
    return DEFAULT_UI_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_UI_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    const validRowHeightMode: RowHeightMode =
      typeof parsed.rowHeightMode === "string" &&
      ROW_HEIGHT_MODE_OPTIONS.some(
        (option) => option.id === parsed.rowHeightMode,
      )
        ? parsed.rowHeightMode
        : DEFAULT_UI_SETTINGS.rowHeightMode;

    return {
      motionEnabled:
        typeof parsed.motionEnabled === "boolean"
          ? parsed.motionEnabled
          : DEFAULT_UI_SETTINGS.motionEnabled,
      overlaysEnabled:
        typeof parsed.overlaysEnabled === "boolean"
          ? parsed.overlaysEnabled
          : DEFAULT_UI_SETTINGS.overlaysEnabled,
      rowHeightMode: validRowHeightMode,
    };
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

export function persistUiSettings(settings: UiSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    UI_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  );
}

export function resolveRowHeightPx(rowHeightMode: RowHeightMode) {
  return (
    ROW_HEIGHT_MODE_OPTIONS.find((option) => option.id === rowHeightMode)
      ?.rowHeightPx ?? 320
  );
}
