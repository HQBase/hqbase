import type * as React from "react";

import { ComposeWindow } from "./compose-window";
import { ThreadComposeSurface } from "./thread-compose-surface";

export function ComposeSurface({
  children,
  formId,
  open,
  presentation,
  sendDisabled,
  status,
  title,
  onOpenChange
}: {
  children: React.ReactNode;
  formId: string;
  open: boolean;
  presentation: "window" | "thread";
  sendDisabled: boolean;
  status: string;
  title: string;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return presentation === "thread" ? (
    <ThreadComposeSurface
      formId={formId}
      sendDisabled={sendDisabled}
      status={status}
      title={title}
      onClose={() => onOpenChange(false)}
    >
      {children}
    </ThreadComposeSurface>
  ) : (
    <ComposeWindow open={open} status={status} title={title} onOpenChange={onOpenChange}>
      {children}
    </ComposeWindow>
  );
}
