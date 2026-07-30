import { ArrowLeft, Send, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

type ThreadComposeSurfaceProps = {
  children: React.ReactNode;
  formId: string;
  sendDisabled: boolean;
  status: string;
  title: string;
  onClose: () => void;
};

export function ThreadComposeSurface({
  children,
  formId,
  sendDisabled,
  status,
  title,
  onClose
}: ThreadComposeSurfaceProps): React.ReactElement {
  const surfaceRef = React.useRef<HTMLElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const statusId = React.useId();

  React.useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const target = surfaceRef.current?.querySelector<HTMLElement>("[data-compose-autofocus]");
      (target ?? surfaceRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <section
      aria-describedby={statusId}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] outline-none lg:static lg:z-auto lg:mt-6 lg:h-auto lg:rounded-lg lg:border lg:bg-card lg:pt-0 lg:shadow-sm"
      ref={surfaceRef}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onClose();
      }}
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 lg:px-4">
        <Button
          aria-label={`Close ${title.toLowerCase()}`}
          className="size-10 lg:hidden"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium" id={titleId}>
            {title}
          </h2>
          <p className="truncate text-xs text-muted-foreground" id={statusId}>
            {status}
          </p>
        </div>
        <Button
          aria-label="Send message"
          className="size-10 lg:hidden"
          disabled={sendDisabled}
          form={formId}
          size="icon"
          type="submit"
        >
          <Send />
        </Button>
        <Button
          aria-label={`Close ${title.toLowerCase()}`}
          className="hidden size-8 lg:inline-flex"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto lg:overflow-visible">{children}</div>
    </section>
  );
}
