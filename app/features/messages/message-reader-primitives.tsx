import type * as React from "react";
import { PiEnvelopeOpen } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function MessageReaderStatus({
  description,
  label
}: {
  description?: string;
  label: string;
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex size-9 items-center justify-center rounded-md border bg-card">
        <PiEnvelopeOpen aria-hidden="true" className="pointer-events-none size-4" />
      </div>
      <div className="grid max-w-sm gap-1">
        <span className="text-xs">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
    </div>
  );
}

export function IconButton({
  active = false,
  activeClassName = "",
  children,
  className,
  label,
  onClick
}: {
  active?: boolean;
  activeClassName?: string;
  children: React.ReactNode;
  className?: string;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  const base =
    "size-10 min-h-10 min-w-10 text-muted-foreground [@media(hover:hover)]:hover:text-foreground";
  return (
    <Button
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn(base, className, active && activeClassName)}
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
