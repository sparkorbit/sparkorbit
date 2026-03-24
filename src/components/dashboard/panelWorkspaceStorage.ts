const INFO_ORDER_STORAGE_KEY = "sparkorbit-info-order-v1";
const INFO_SIZE_STORAGE_KEY = "sparkorbit-info-sizes-v1";
const UNASSIGNED_ORDER_STORAGE_KEY = "sparkorbit-unassigned-order-v1";
const UNASSIGNED_SIZE_STORAGE_KEY = "sparkorbit-unassigned-sizes-v1";

const PANEL_WORKSPACE_STORAGE_KEYS = [
  INFO_ORDER_STORAGE_KEY,
  INFO_SIZE_STORAGE_KEY,
  UNASSIGNED_ORDER_STORAGE_KEY,
  UNASSIGNED_SIZE_STORAGE_KEY,
] as const;

export const PANEL_WORKSPACE_STORAGE = {
  infoOrder: INFO_ORDER_STORAGE_KEY,
  infoSize: INFO_SIZE_STORAGE_KEY,
  unassignedOrder: UNASSIGNED_ORDER_STORAGE_KEY,
  unassignedSize: UNASSIGNED_SIZE_STORAGE_KEY,
} as const;

export function resetPanelWorkspaceStorage() {
  if (typeof window === "undefined") {
    return;
  }

  PANEL_WORKSPACE_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}
