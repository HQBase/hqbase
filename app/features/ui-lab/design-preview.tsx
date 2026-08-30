import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/features/theme/theme-provider";

import { DataInteractionsPreview } from "./design-preview-data-interactions";
import { FoundationsControlsPreview } from "./design-preview-foundations-controls";
import { PatternsPreview } from "./design-preview-patterns";
import { sections } from "./design-preview-shared";

export function DesignPreview(): React.ReactElement {
  const { setTheme, theme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img alt="HQBase" className="h-7 w-auto shrink-0" src="/logo.svg" />
            <Separator className="hidden h-6 sm:block" orientation="vertical" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Design UI lab</p>
              <p className="truncate text-xs text-muted-foreground">
                Development fixtures only. No APIs or customer data.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className="hidden sm:inline-flex" variant="outline">
              24 primitives
            </Badge>
            <fieldset className="flex rounded-lg border bg-card p-1">
              <legend className="sr-only">Preview appearance</legend>
              <Button
                aria-pressed={theme === "light"}
                className="h-7 min-h-7 px-2.5 text-xs"
                onClick={() => setTheme("light")}
                type="button"
                variant={theme === "light" ? "secondary" : "ghost"}
              >
                Light
              </Button>
              <Button
                aria-pressed={theme === "dark"}
                className="h-7 min-h-7 px-2.5 text-xs"
                onClick={() => setTheme("dark")}
                type="button"
                variant={theme === "dark" ? "secondary" : "ghost"}
              >
                Dark
              </Button>
            </fieldset>
          </div>
        </div>
        <nav
          aria-label="UI lab sections"
          className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto border-t px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
        >
          {sections.map(([id, label]) => (
            <a
              className="shrink-0 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              href={`#${id}`}
              key={id}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-r px-4 py-8 lg:block">
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">
            Inventory
          </p>
          <nav aria-label="UI lab inventory" className="space-y-1">
            {sections.map(([id, label], index) => (
              <a
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                href={`#${id}`}
                key={id}
              >
                <span>{label}</span>
                <span className="font-mono text-[11px] text-tertiary">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </a>
            ))}
          </nav>
          <div className="absolute inset-x-4 bottom-6 rounded-lg border bg-card p-3 text-xs leading-5 text-muted-foreground">
            Resize the browser to inspect compact behavior.
          </div>
        </aside>

        <main className="min-w-0 px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
          <div className="mx-auto max-w-6xl space-y-20">
            <section className="max-w-3xl">
              <Badge className="mb-5" variant="secondary">
                Visual source of truth
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">See the system.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Review shared tokens, real components, interactive states, and recurring HQBase
                patterns in one stable development view.
              </p>
            </section>

            <FoundationsControlsPreview />
            <DataInteractionsPreview />
            <PatternsPreview />
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
