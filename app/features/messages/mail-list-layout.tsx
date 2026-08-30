import type * as React from "react";

import { cn } from "@/lib/cn";

type MailListHeaderProps = {
  actions?: React.ReactNode;
  countLabel?: string | null;
  title: string;
};

export function MailListHeader({
  actions,
  countLabel,
  title
}: MailListHeaderProps): React.ReactElement {
  return (
    <div className="flex h-11 shrink-0 items-center border-b border-divider bg-toolbar">
      <div
        className="mx-auto grid w-full max-w-[960px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:grid-cols-[2rem_minmax(7rem,18%)_1rem_minmax(0,1fr)_1.75rem_4rem] sm:gap-x-1.5 sm:px-9 lg:px-11"
        data-mail-list-header-layout
      >
        <span className="min-w-0 truncate text-sm font-medium text-foreground sm:col-span-2 sm:col-start-1">
          {title}
        </span>
        {actions ? (
          <div className="col-start-2 flex min-w-0 items-center justify-end sm:col-start-4 sm:row-start-1">
            {actions}
          </div>
        ) : null}
        {countLabel ? (
          <span className="hidden shrink-0 justify-self-end whitespace-nowrap text-[12px] tabular-nums text-tertiary sm:col-span-2 sm:col-start-5 sm:row-start-1 sm:inline">
            {countLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function mailListRowClassName(isActive: boolean): string {
  return cn(
    "group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_4rem] items-start gap-x-3 rounded-xl px-3 py-3 text-left text-[14px] leading-5 [--message-row-surface:var(--surface-list)] transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[2rem_minmax(7rem,18%)_1rem_minmax(0,1fr)_1.75rem_4rem] sm:items-center sm:gap-x-1.5 sm:py-2 sm:text-[13px]",
    isActive
      ? "bg-selected [--message-row-surface:var(--surface-selected)] [@media(hover:hover)]:hover:bg-selected"
      : "[@media(hover:hover)]:hover:bg-hover [@media(hover:hover)]:hover:[--message-row-surface:var(--surface-hover)]"
  );
}
