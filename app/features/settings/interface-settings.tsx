import type * as React from "react";

import { SettingsSection } from "@/features/settings/settings-section";
import { useTheme } from "@/features/theme/theme-provider";
import { cn } from "@/lib/cn";

export function InterfaceSettings(): React.ReactElement {
  const { setTheme, theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <SettingsSection description="Appearance preferences for this browser" title="Interface">
      <div className="divide-y border-y text-sm">
        <div className="flex items-center justify-between gap-6 py-4">
          <div>
            <p className="font-medium">Dark mode</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Toggle the theme. Stored locally in this browser.
            </p>
          </div>
          <button
            aria-checked={isDark}
            aria-label={isDark ? "Dark mode on" : "Dark mode off"}
            className="flex shrink-0 items-center gap-2"
            role="switch"
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-6 w-11 items-center rounded-full border px-0.5 transition-colors",
                isDark ? "border-input bg-foreground/90" : "border-input bg-muted"
              )}
            >
              <span
                className={cn(
                  "size-5 rounded-full bg-background shadow-sm transition-transform",
                  isDark ? "translate-x-5 bg-card" : "translate-x-0"
                )}
              />
            </span>
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}
