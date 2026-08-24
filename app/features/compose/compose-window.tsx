import * as React from "react";
import { createPortal } from "react-dom";
import { PiCaretUp, PiMinus, PiX } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ComposeWindowProps = {
  children: React.ReactNode;
  open: boolean;
  status: string;
  title: string;
  onOpenChange: (open: boolean) => void;
};

type WindowPosition = { left: number; top: number };
type WindowDrag = WindowPosition & {
  height: number;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
};

export function ComposeWindow({
  children,
  open,
  status,
  title,
  onOpenChange
}: ComposeWindowProps): React.ReactElement | null {
  const [desktop, setDesktop] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);
  const [position, setPosition] = React.useState<WindowPosition | null>(null);
  const dragRef = React.useRef<WindowDrag | null>(null);
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
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => {
      setDesktop(query.matches);
      if (!query.matches) {
        dragRef.current = null;
        setPosition(null);
      }
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    if (!open || !desktop || position) return;
    const frame = window.requestAnimationFrame(() => {
      const rect = windowRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(clampWindowPosition(rect.left, rect.top, rect.width, rect.height));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [desktop, open, position]);

  React.useEffect(() => {
    if (!open || !desktop) return;
    const element = windowRef.current;
    if (!element) return;
    const clampCurrentPosition = () => {
      const rect = element.getBoundingClientRect();
      setPosition((current) =>
        current ? clampWindowPosition(current.left, current.top, rect.width, rect.height) : current
      );
    };
    window.addEventListener("resize", clampCurrentPosition);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(clampCurrentPosition);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", clampCurrentPosition);
      observer?.disconnect();
    };
  }, [desktop, open]);

  React.useEffect(() => {
    if (open) return;
    setMinimized(false);
    setPosition(null);
    dragRef.current = null;
  }, [open]);

  if (!open) return null;

  const content = (
    <section
      aria-describedby={statusId}
      aria-labelledby={titleId}
      aria-modal="false"
      className={cn(
        "fixed inset-0 z-[60] flex h-[100dvh] w-full flex-col overflow-hidden bg-card pt-[env(safe-area-inset-top)] shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:inset-auto md:bottom-0 md:right-4 md:z-[60] md:h-[min(42rem,calc(100vh-5rem))] md:max-h-[calc(100vh-1rem)] md:min-h-96 md:w-[min(42rem,calc(100vw-2rem))] md:max-w-[calc(100vw-2rem)] md:min-w-96 md:rounded-t-lg md:border md:pt-0",
        !minimized && "md:resize",
        minimized &&
          "md:h-auto md:min-h-0 md:w-80 md:min-w-0 md:resize-none md:translate-x-0 md:rounded-b-none md:rounded-t-lg"
      )}
      ref={windowRef}
      role="dialog"
      style={desktop && position ? { ...position, bottom: "auto", right: "auto" } : undefined}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onOpenChange(false);
      }}
    >
      <header
        className="flex min-h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 md:cursor-move md:select-none md:touch-none [&_button]:cursor-default"
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        onPointerDown={(event) => {
          if (
            !desktop ||
            event.button !== 0 ||
            (event.target instanceof Element && event.target.closest("button"))
          ) {
            return;
          }
          const rect = windowRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragRef.current = {
            height: rect.height,
            left: rect.left,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            top: rect.top,
            width: rect.width
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setPosition(
            clampWindowPosition(
              drag.left + event.clientX - drag.startX,
              drag.top + event.clientY - drag.startY,
              drag.width,
              drag.height
            )
          );
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
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
            className="hidden size-10 min-h-10 min-w-10 md:inline-flex"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setMinimized((current) => !current)}
          >
            {minimized ? (
              <PiCaretUp aria-hidden="true" className="pointer-events-none" />
            ) : (
              <PiMinus aria-hidden="true" className="pointer-events-none" />
            )}
          </Button>
          <Button
            aria-label="Close compose"
            className="size-10 min-h-10 min-w-10"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <PiX aria-hidden="true" className="pointer-events-none" />
          </Button>
        </div>
      </header>
      <div className={cn("min-h-0 flex-1 flex-col", minimized ? "flex md:hidden" : "flex")}>
        {children}
      </div>
    </section>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

function clampWindowPosition(
  left: number,
  top: number,
  width: number,
  height: number
): WindowPosition {
  return {
    left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - width)),
    top: Math.min(Math.max(0, top), Math.max(0, window.innerHeight - height))
  };
}
