import * as React from "react";

import {
  type AppTheme,
  applyTheme,
  normalizeTheme,
  persistTheme,
  readStoredTheme,
  themeStorageKey
} from "./theme";

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => undefined
});

export function ThemeProvider({
  children,
  initialTheme
}: {
  children: React.ReactNode;
  initialTheme?: AppTheme;
}): React.ReactElement {
  const [theme, setThemeState] = React.useState<AppTheme>(() => initialTheme ?? readStoredTheme());

  const setTheme = React.useCallback((nextTheme: AppTheme) => {
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    setThemeState(nextTheme);
  }, []);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== themeStorageKey) return;
      const nextTheme = normalizeTheme(event.newValue);
      applyTheme(nextTheme);
      setThemeState(nextTheme);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return <ThemeContext.Provider value={{ setTheme, theme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}
