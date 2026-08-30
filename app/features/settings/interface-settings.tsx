import type * as React from "react";

import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/features/settings/settings-section";
import { useTheme } from "@/features/theme/theme-provider";

export function InterfaceSettings(): React.ReactElement {
  const { setTheme, theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <SettingsSection description="Appearance preferences for this browser" title="Appearance">
      <div className="divide-y border-y text-sm">
        <div className="flex items-center justify-between gap-6 py-4">
          <div>
            <p className="font-medium">Dark mode</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Toggle the theme. Stored locally in this browser.
            </p>
          </div>
          <Switch
            aria-label="Dark mode"
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
