import type * as React from "react";

export function SetupFrame({
  children,
  description,
  progress,
  title
}: {
  children: React.ReactNode;
  description: string;
  progress: string;
  title: string;
}): React.ReactElement {
  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-md border bg-card font-mono text-[10px] font-semibold">
              HQ
            </span>
            <span className="text-sm font-medium">HQBase</span>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{progress}</span>
        </header>

        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        {children}
      </div>
    </main>
  );
}
