import type * as React from "react";

import type { MailConnectionStatus } from "@/features/events/types";
import { cn } from "@/lib/cn";

const statusPresentation: Record<MailConnectionStatus, { className: string; label: string }> = {
  connecting: {
    className: "bg-muted-foreground/45 motion-safe:animate-pulse",
    label: "Connecting to live updates"
  },
  connected: {
    className: "bg-emerald-500 ring-2 ring-emerald-500/15",
    label: "Live updates connected"
  },
  fallback: {
    className: "bg-amber-400 ring-2 ring-amber-400/15",
    label: "Using fallback sync while live updates reconnect"
  },
  unavailable: {
    className: "bg-red-500 ring-2 ring-red-500/15",
    label: "Cannot connect to HQBase"
  }
};

export function MailConnectionIndicator({
  status
}: {
  status: MailConnectionStatus;
}): React.ReactElement {
  const presentation = statusPresentation[status];

  return (
    <span
      aria-label={presentation.label}
      aria-live="polite"
      className="inline-flex size-4 shrink-0 items-center justify-center"
      data-connection-status={status}
      role="status"
      title={presentation.label}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full transition-colors duration-200", presentation.className)}
      />
    </span>
  );
}
