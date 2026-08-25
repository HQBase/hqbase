import * as React from "react";
import { createPortal } from "react-dom";
import { PiArrowBendUpLeft, PiCaretUp, PiMinus, PiX } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ComposeWindowProps = {
  children: React.ReactNode;
  dockIndex?: number;
  dockTarget?: HTMLElement | null;
  minimized?: boolean | undefined;
  open: boolean;
  status: string;
  title: string;
  windowSlot?: number;
  onMinimizedChange?: ((minimized: boolean) => void) | undefined;
  onOpenChange: (open: boolean) => void;
  onReturnToThread?: (() => void) | undefined;
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
  dockIndex = 0,
  dockTarget = null,
  minimized: controlledMinimized,
  open,
  status,
  title,
  windowSlot = 0,
  onMinimizedChange,
  onOpenChange,
  onReturnToThread
}: ComposeWindowProps): React.ReactElement | null {
  const [desktop, setDesktop] = React.useState(false);
  const [internalMinimized, setInternalMinimized] = React.useState(false);
  const minimized = controlledMinimized ?? internalMinimized;
  const [position, setPosition] = React.useState<WindowPosition | null>(null);
  const [layer, setLayer] = React.useState(nextWindowLayer);
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
    const query = window.matchMedia("(min-width: 1024px)");
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
    if (!open || !desktop || minimized) return;
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
  }, [desktop, minimized, open]);

  React.useEffect(() => {
    if (open) return;
    setInternalMinimized(false);
    setPosition(null);
    dragRef.current = null;
  }, [open]);

  if (!open) return null;

  const stackRow = windowSlot % 2;
  const stackColumn = Math.floor(windowSlot / 2);
  const windowStyle: React.CSSProperties | undefined = !desktop
    ? undefined
    : minimized && dockTarget
      ? { order: dockIndex }
      : minimized
        ? { bottom: 0, left: "auto", right: 16, top: "auto", zIndex: layer }
        : position
          ? { ...position, bottom: "auto", right: "auto", zIndex: layer }
          : {
              bottom: stackRow * 56,
              left: "auto",
              right: 16 + stackColumn * 80,
              top: "auto",
              zIndex: layer
            };

  const content = (
    <section
      aria-describedby={statusId}
      aria-labelledby={titleId}
      aria-modal="false"
      className={cn(
        "fixed inset-0 z-[60] flex h-[100dvh] w-full flex-col overflow-hidden bg-card pt-[env(safe-area-inset-top)] shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:inset-auto lg:bottom-0 lg:right-4 lg:z-[60] lg:h-[min(42rem,calc(100vh-5rem))] lg:max-h-[calc(100vh-1rem)] lg:min-h-96 lg:w-[min(42rem,calc(100vw-2rem))] lg:max-w-[calc(100vw-2rem)] lg:min-w-96 lg:rounded-t-lg lg:border lg:pt-0",
        !minimized && "lg:resize",
        minimized &&
          "lg:h-auto lg:min-h-0 lg:w-80 lg:min-w-0 lg:shrink-0 lg:resize-none lg:translate-x-0 lg:rounded-b-none lg:rounded-t-lg",
        minimized && dockTarget && "lg:relative lg:inset-auto lg:flex-none"
      )}
      ref={windowRef}
      role="dialog"
      style={windowStyle}
      tabIndex={-1}
      onFocusCapture={() => setLayer(nextWindowLayer())}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onOpenChange(false);
      }}
      onPointerDownCapture={() => setLayer(nextWindowLayer())}
    >
      <header
        className={cn(
          "flex min-h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 lg:select-none lg:touch-none [&_button]:cursor-default",
          minimized ? "lg:cursor-default" : "lg:cursor-move"
        )}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        onPointerDown={(event) => {
          if (
            !desktop ||
            minimized ||
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
          {onReturnToThread ? (
            <Button
              aria-label="Return to conversation"
              className="size-10 min-h-10 min-w-10"
              size="icon"
              type="button"
              variant="ghost"
              onClick={onReturnToThread}
            >
              <PiArrowBendUpLeft aria-hidden="true" className="pointer-events-none" />
            </Button>
          ) : null}
          <Button
            aria-label={minimized ? "Restore compose" : "Minimize compose"}
            className="hidden size-10 min-h-10 min-w-10 lg:inline-flex"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              const next = !minimized;
              setInternalMinimized(next);
              onMinimizedChange?.(next);
            }}
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
      <div className={cn("min-h-0 flex-1 flex-col", minimized ? "flex lg:hidden" : "flex")}>
        {children}
      </div>
    </section>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, desktop && minimized && dockTarget ? dockTarget : document.body);
}

let windowLayer = 60;

function nextWindowLayer(): number {
  windowLayer += 1;
  return windowLayer;
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
