export type AppTheme = "light" | "dark";

export const themeStorageKey = "hqb_theme_v1";

const themeColors: Record<AppTheme, string> = {
  dark: "#080808",
  light: "#ffffff"
};

export function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return normalizeTheme(window.localStorage.getItem(themeStorageKey));
  } catch {
    return "dark";
  }
}

export function normalizeTheme(value: string | null): AppTheme {
  return value === "light" ? "light" : "dark";
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColors[theme]);
}

export function persistTheme(theme: AppTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // Appearance still applies for the current session when storage is unavailable.
  }
}

export function initializeTheme(): AppTheme {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}
