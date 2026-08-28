import * as React from "react";
import { createPortal } from "react-dom";

import { ComposeWindow } from "./compose-window";
import { ThreadComposeSurface } from "./thread-compose-surface";

export function ComposeSurface({
  children,
  dockIndex,
  dockTarget,
  formId,
  inlineTarget,
  minimized,
  open,
  presentation,
  sendDisabled,
  status,
  title,
  windowSlot,
  onDetach,
  onMinimizedChange,
  onOpenChange,
  onReturnToThread
}: {
  children: React.ReactNode;
  dockIndex: number;
  dockTarget: HTMLElement | null;
  formId: string;
  inlineTarget: HTMLElement | null;
  minimized?: boolean | undefined;
  open: boolean;
  presentation: "window" | "thread";
  sendDisabled: boolean;
  status: string;
  title: string;
  windowSlot: number;
  onDetach?: (() => void) | undefined;
  onMinimizedChange?: ((minimized: boolean) => void) | undefined;
  onOpenChange: (open: boolean) => void;
  onReturnToThread?: (() => void) | undefined;
}): React.ReactElement {
  const [bodyTarget] = React.useState(() => {
    if (typeof document === "undefined") return null;
    const target = document.createElement("div");
    target.className = "flex min-h-0 flex-1 flex-col";
    target.dataset.composeBody = "";
    return target;
  });
  const attachBody = React.useCallback(
    (host: HTMLDivElement | null) => {
      if (host && bodyTarget && bodyTarget.parentElement !== host) {
        host.insertAdjacentElement("beforeend", bodyTarget);
      }
    },
    [bodyTarget]
  );
  const bodyMount = <div className="flex min-h-0 flex-1 flex-col" ref={attachBody} />;

  return (
    <>
      {presentation === "thread" ? (
        <ThreadComposeSurface
          formId={formId}
          inlineTarget={inlineTarget}
          sendDisabled={sendDisabled}
          status={status}
          title={title}
          onClose={() => onOpenChange(false)}
          onDetach={onDetach}
        >
          {bodyMount}
        </ThreadComposeSurface>
      ) : (
        <ComposeWindow
          dockIndex={dockIndex}
          dockTarget={dockTarget}
          minimized={minimized}
          open={open}
          status={status}
          title={title}
          windowSlot={windowSlot}
          onMinimizedChange={onMinimizedChange}
          onOpenChange={onOpenChange}
          onReturnToThread={onReturnToThread}
        >
          {bodyMount}
        </ComposeWindow>
      )}
      {bodyTarget ? createPortal(children, bodyTarget) : children}
    </>
  );
}
