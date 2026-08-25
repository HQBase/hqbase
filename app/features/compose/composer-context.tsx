import * as React from "react";

import type { MessageDetail } from "@/features/messages/types";
import type { AppRoute, MailFolderId } from "@/lib/routes";

import type { ComposeMode } from "./compose-state";

type ContextMode = Extract<ComposeMode, "reply" | "forward">;

export type ComposerOrigin = {
  folder: MailFolderId;
  messageId: string;
  threadId: string;
};

export type ComposerSessionView = {
  detached: boolean;
  draftId: string | null;
  id: string;
  mode: ComposeMode;
  origin: ComposerOrigin | null;
};

export type OpenContextInput = {
  message: MessageDetail;
  messages: MessageDetail[];
  mode: ContextMode;
  onSent?: (() => void) | undefined;
  origin: ComposerOrigin;
  route: AppRoute;
};

export type OpenDraftInput = {
  draftId: string;
  message: MessageDetail | null;
  messages: MessageDetail[];
  mode: ComposeMode;
  origin: ComposerOrigin | null;
  route: AppRoute;
};

export type ComposerControls = {
  openContext: (input: OpenContextInput) => string;
  openDraft: (input: OpenDraftInput) => string;
  openNew: (initialTo?: string) => string;
  registerInlineTarget: (sessionId: string, target: HTMLElement | null) => void;
  sessions: readonly ComposerSessionView[];
};

const fallbackControls: ComposerControls = {
  openContext: () => "",
  openDraft: () => "",
  openNew: () => "",
  registerInlineTarget: () => undefined,
  sessions: []
};

export const ComposerContext = React.createContext<ComposerControls>(fallbackControls);

export function useComposer(): ComposerControls {
  return React.useContext(ComposerContext);
}

export function ComposerInlineTarget({ sessionId }: { sessionId: string }): React.ReactElement {
  const { registerInlineTarget } = useComposer();
  const setTarget = React.useCallback(
    (target: HTMLDivElement | null) => registerInlineTarget(sessionId, target),
    [registerInlineTarget, sessionId]
  );
  return <div data-composer-inline-target={sessionId} ref={setTarget} />;
}
