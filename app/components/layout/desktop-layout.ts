export const desktopMinimumWidth = 1024;
export const desktopMinimumHeight = 600;

export const sidebarCollapsedStorageKey = "hqb_desktop_sidebar_collapsed_v1";
export const sidebarWidthStorageKey = "hqb_desktop_sidebar_width_v1";
export const conversationListWidthStorageKey = "hqb_desktop_conversation_width_v1";

export const defaultSidebarWidth = 224;
export const minimumSidebarWidth = 176;
export const maximumSidebarWidth = 320;

export const defaultConversationListWidth = 360;
export const minimumConversationListWidth = 280;
export const maximumConversationListWidth = 520;
export const minimumConversationReaderWidth = 420;

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function readStoredWidth(
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (typeof window === "undefined") return fallback;
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
  } catch {
    return fallback;
  }
}

export function storeLayoutValue(key: string, value: boolean | number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Layout preferences are best-effort and never block the mail surface.
  }
}
