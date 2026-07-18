import type * as React from "react";

export function SetupFrame({
  children,
  description,
  title
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}): React.ReactElement {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-xl flex-col">
        <section aria-labelledby="setup-title">
          <h1 id="setup-title" className="text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </section>

        {children}
      </div>
    </main>
  );
}
