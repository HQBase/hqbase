import { Moon, Sun } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useTheme } from "./theme-provider";

export function ThemeSwitcher({ drawer = false }: { drawer?: boolean }): React.ReactElement {
  const { setTheme, theme } = useTheme();
  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <Button
      aria-label={`Switch to ${nextTheme} mode`}
      className={cn(
        "h-8 w-full justify-start gap-2.5 px-2.5 text-[13px] font-normal text-muted-foreground",
        drawer && "h-11 text-sm"
      )}
      data-theme-switcher
      onClick={() => setTheme(nextTheme)}
      title={`Switch to ${nextTheme} mode`}
      type="button"
      variant="ghost"
    >
      <Icon strokeWidth={1.5} />
      <span>{isDark ? "Dark mode" : "Light mode"}</span>
      <span
        aria-hidden="true"
        className="ml-auto flex h-5 w-9 items-center rounded-full border border-input bg-muted px-0.5"
      >
        <span
          className={cn(
            "size-4 rounded-full bg-foreground transition-transform",
            isDark && "translate-x-4"
          )}
        />
      </span>
    </Button>
  );
}
