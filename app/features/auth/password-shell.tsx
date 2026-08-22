import type * as React from "react";

export function PasswordShell({
  children,
  description,
  footer,
  title
}: {
  children: React.ReactNode;
  description: string;
  footer?: React.ReactNode;
  title: string;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-rail px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-center gap-2">
          <img alt="" className="h-7 w-auto rounded-md object-contain" src="/logo.svg" />
        </div>
        <section className="overflow-hidden rounded-[24px] border border-divider bg-sidebar shadow-sm">
          <header className="px-6 pb-2 pt-5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </header>
          <div className="px-6 pb-6 pt-3">{children}</div>
          {footer ? (
            <footer className="flex justify-center border-t border-divider bg-card/30 px-6 py-4">
              {footer}
            </footer>
          ) : null}
        </section>
        <p className="mt-4 text-center text-[11px] text-tertiary">Self-hosted on Cloudflare</p>
      </div>
    </main>
  );
}
