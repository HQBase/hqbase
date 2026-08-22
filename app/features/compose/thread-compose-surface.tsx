import * as React from "react";
import { createPortal } from "react-dom";
import { PiArrowLeft, PiPaperPlaneTilt, PiX } from "react-icons/pi";

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

  const isDesktop =
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

  const desktop = (
    <section
      aria-describedby={statusId}
      aria-labelledby={titleId}
      className="mt-6 flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm outline-none"
      ref={surfaceRef}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onClose();
      }}
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium" id={titleId}>
            {title}
          </h2>
          <p className="truncate text-xs text-muted-foreground" id={statusId}>
            {status}
          </p>
        </div>
        <Button
          aria-label={`Close ${title.toLowerCase()}`}
          className="size-10 min-h-10 min-w-10"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <PiX aria-hidden="true" className="pointer-events-none" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-visible">{children}</div>
    </section>
  );

  if (isDesktop) {
    return desktop;
  }

  const overlay = (
    <section
      aria-describedby={statusId}
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex h-[100dvh] flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] outline-none"
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
          <PiArrowLeft aria-hidden="true" className="pointer-events-none" />
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
          className="size-10 min-h-10 min-w-10 lg:hidden"
          disabled={sendDisabled}
          form={formId}
          size="icon"
          type="submit"
          variant="liquidGlass"
        >
          <PiPaperPlaneTilt aria-hidden="true" className="pointer-events-none" />
        </Button>
        <Button
          aria-label={`Close ${title.toLowerCase()}`}
          className="hidden size-10 min-h-10 min-w-10 lg:inline-flex"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <PiX aria-hidden="true" className="pointer-events-none" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto lg:overflow-visible">{children}</div>
    </section>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
