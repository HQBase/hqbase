import type * as React from "react";

export const sections = [
  ["foundations", "Foundations"],
  ["actions", "Actions"],
  ["forms", "Forms"],
  ["data", "Data display"],
  ["navigation", "Navigation"],
  ["feedback", "Feedback"],
  ["overlays", "Overlays"],
  ["patterns", "Product patterns"],
  ["screens", "Real screens"]
] as const;

export function InventorySection({
  children,
  description,
  id,
  title
}: {
  children: React.ReactNode;
  description: string;
  id: string;
  title: string;
}): React.ReactElement {
  return (
    <section className="scroll-mt-32" id={id}>
      <div className="mb-7 border-b pb-5">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">{children}</div>
    </section>
  );
}

export function Specimen({
  children,
  path,
  title,
  wide = false
}: {
  children: React.ReactNode;
  path: string;
  title: string;
  wide?: boolean;
}): React.ReactElement {
  return (
    <article
      className={`min-w-0 overflow-hidden rounded-xl border bg-card ${wide ? "lg:col-span-2" : ""}`}
    >
      <header className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <code className="truncate text-[11px] text-tertiary">{path}</code>
      </header>
      <div className="min-h-28 bg-background p-4 sm:p-5">{children}</div>
    </article>
  );
}

export function ScreenLink({ href, label }: { href: string; label: string }): React.ReactElement {
  return (
    <a
      className="group flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <span>{label}</span>
      <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground">
        {href}
      </span>
    </a>
  );
}
