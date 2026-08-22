export const sidebarCollapsedStorageKey = "hqb_desktop_sidebar_collapsed_v1";

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function storeLayoutValue(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Layout preferences are best-effort and never block the mail surface.
  }
}
