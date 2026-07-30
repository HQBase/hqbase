import { ChevronUp, Maximize2, Minimize2, Minus, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ComposeWindowProps = {
  children: React.ReactNode;
  open: boolean;
  status: string;
  title: string;
  onOpenChange: (open: boolean) => void;
};

export function ComposeWindow({
  children,
  open,
  status,
  title,
  onOpenChange
}: ComposeWindowProps): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);
  const windowRef = React.useRef<HTMLElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const statusId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const focusTarget = windowRef.current?.querySelector<HTMLElement>("[data-compose-autofocus]");
      (focusTarget ?? windowRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  React.useEffect(() => {
    if (open) return;
    setExpanded(false);
    setMinimized(false);
  }, [open]);

  if (!open) return null;

  return (
    <section
      aria-describedby={statusId}
      aria-labelledby={titleId}
      aria-modal="false"
      className={cn(
        "fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-card pt-[env(safe-area-inset-top)] shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:inset-auto md:bottom-0 md:right-4 md:z-40 md:h-[min(42rem,calc(100vh-5rem))] md:w-[min(42rem,calc(100vw-2rem))] md:rounded-t-lg md:border md:pt-0",
        expanded &&
          "md:bottom-6 md:right-1/2 md:h-[min(48rem,calc(100vh-3rem))] md:w-[min(64rem,calc(100vw-3rem))] md:translate-x-1/2 md:rounded-lg",
        minimized &&
          "md:bottom-0 md:right-4 md:h-auto md:w-80 md:translate-x-0 md:rounded-b-none md:rounded-t-lg"
      )}
      ref={windowRef}
      role="dialog"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onOpenChange(false);
      }}
    >
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium" id={titleId}>
            {title}
          </h2>
          <p className="truncate text-xs text-muted-foreground" id={statusId}>
            {minimized ? "Draft minimized" : status}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label={minimized ? "Restore compose" : "Minimize compose"}
            className="hidden size-8 md:inline-flex"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setMinimized((current) => !current)}
          >
            {minimized ? <ChevronUp /> : <Minus />}
          </Button>
          <Button
            aria-label={expanded ? "Restore compose size" : "Expand compose"}
            className="hidden size-8 md:inline-flex"
            disabled={minimized}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            aria-label="Close compose"
            className="size-8"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <X />
          </Button>
        </div>
      </header>
      <div className={cn("min-h-0 flex-1 flex-col", minimized ? "flex md:hidden" : "flex")}>
        {children}
      </div>
    </section>
  );
}
