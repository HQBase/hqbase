import * as React from "react";

import type { Mailbox } from "@/features/mailboxes/types";
import { ConversationMessages } from "@/features/messages/conversation-messages";
import type { MessageDetail } from "@/features/messages/types";
import { type AppRoute, appRoutePath } from "@/lib/routes";

import {
  ComposerContext,
  type ComposerControls,
  type ComposerSessionView,
  type OpenContextInput,
  type OpenDraftInput
} from "./composer-context";

export type {
  ComposerControls,
  ComposerOrigin,
  ComposerSessionView,
  OpenContextInput,
  OpenDraftInput
} from "./composer-context";
export { ComposerInlineTarget, useComposer } from "./composer-context";

const ComposeDialog = React.lazy(() =>
  import("./compose-dialog").then((module) => ({ default: module.ComposeDialog }))
);

type ComposerSession = ComposerSessionView & {
  initialDraftId: string | null;
  initialTo: string;
  message: MessageDetail | null;
  messages: MessageDetail[];
  minimized: boolean;
  onSent?: (() => void) | undefined;
  sourceRoute: AppRoute | null;
};

export function ComposerHost({
  children,
  defaultFromMailboxId,
  mailboxes,
  navigate,
  route,
  onDraftsChange,
  onManageSignatures,
  onSent
}: {
  children: (controls: ComposerControls) => React.ReactNode;
  defaultFromMailboxId: string | null;
  mailboxes: Mailbox[];
  navigate: (route: AppRoute) => void;
  route: AppRoute;
  onDraftsChange: () => void;
  onManageSignatures: () => void;
  onSent: () => void;
}): React.ReactElement {
  const [sessions, setSessions] = React.useState<ComposerSession[]>([]);
  const [inlineTargets, setInlineTargets] = React.useState<Record<string, HTMLElement>>({});
  const [dockTarget, setDockTarget] = React.useState<HTMLElement | null>(null);
  const [parkingTarget, setParkingTarget] = React.useState<HTMLElement | null>(null);
  const sessionsRef = React.useRef(sessions);
  const routeRef = React.useRef(route);
  const navigateRef = React.useRef(navigate);
  const onDraftsChangeRef = React.useRef(onDraftsChange);
  const onManageSignaturesRef = React.useRef(onManageSignatures);
  const onSentRef = React.useRef(onSent);
  routeRef.current = route;
  navigateRef.current = navigate;
  onDraftsChangeRef.current = onDraftsChange;
  onManageSignaturesRef.current = onManageSignatures;
  onSentRef.current = onSent;

  const updateSessions = React.useCallback(
    (update: (current: ComposerSession[]) => ComposerSession[]) => {
      const next = update(sessionsRef.current);
      sessionsRef.current = next;
      setSessions(next);
    },
    []
  );

  const openNew = React.useCallback(
    (initialTo = "") => {
      const id = newComposerId();
      updateSessions((current) => [
        ...current,
        {
          detached: true,
          draftId: null,
          id,
          initialDraftId: null,
          initialTo,
          message: null,
          messages: [],
          minimized: false,
          mode: "new",
          origin: null,
          sourceRoute: null
        }
      ]);
      return id;
    },
    [updateSessions]
  );

  const openContext = React.useCallback(
    (input: OpenContextInput) => {
      const existing = sessionsRef.current.find(
        (session) => session.mode === input.mode && session.message?.id === input.message.id
      );
      if (existing) {
        updateSessions((current) =>
          current.map((session) =>
            session.id === existing.id
              ? {
                  ...session,
                  detached: false,
                  message: input.message,
                  messages: input.messages,
                  minimized: false,
                  onSent: input.onSent,
                  origin: input.origin
                }
              : session
          )
        );
        return existing.id;
      }

      const id = newComposerId();
      updateSessions((current) => [
        ...current,
        {
          detached: false,
          draftId: null,
          id,
          initialDraftId: null,
          initialTo: "",
          message: input.message,
          messages: input.messages,
          minimized: false,
          mode: input.mode,
          onSent: input.onSent,
          origin: input.origin,
          sourceRoute: null
        }
      ]);
      return id;
    },
    [updateSessions]
  );

  const openDraft = React.useCallback(
    (input: OpenDraftInput) => {
      const existing = sessionsRef.current.find(
        (session) =>
          session.draftId === input.draftId ||
          session.initialDraftId === input.draftId ||
          (session.draftId === null &&
            session.initialDraftId === null &&
            input.message !== null &&
            session.mode === input.mode &&
            session.message?.id === input.message.id)
      );
      if (existing) {
        updateSessions((current) =>
          current.map((session) =>
            session.id === existing.id
              ? {
                  ...session,
                  detached: input.message === null,
                  draftId: input.draftId,
                  initialDraftId: input.draftId,
                  message: input.message,
                  messages: input.messages,
                  minimized: false,
                  mode: input.mode,
                  origin: input.origin,
                  sourceRoute: input.route
                }
              : session
          )
        );
        return existing.id;
      }

      const id = newComposerId();
      updateSessions((current) => [
        ...current,
        {
          detached: input.message === null,
          draftId: input.draftId,
          id,
          initialDraftId: input.draftId,
          initialTo: "",
          message: input.message,
          messages: input.messages,
          minimized: false,
          mode: input.mode,
          origin: input.origin,
          sourceRoute: input.route
        }
      ]);
      return id;
    },
    [updateSessions]
  );

  const registerInlineTarget = React.useCallback(
    (sessionId: string, target: HTMLElement | null) => {
      setInlineTargets((current) => {
        if (target) {
          if (current[sessionId] === target) return current;
          return { ...current, [sessionId]: target };
        }
        if (!(sessionId in current)) return current;
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    },
    []
  );

  const controls = React.useMemo<ComposerControls>(
    () => ({
      openContext,
      openDraft,
      openNew,
      registerInlineTarget,
      sessions: sessions.map(({ detached, draftId, id, mode, origin }) => ({
        detached,
        draftId,
        id,
        mode,
        origin
      }))
    }),
    [openContext, openDraft, openNew, registerInlineTarget, sessions]
  );

  const closeSession = React.useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find((candidate) => candidate.id === sessionId);
      updateSessions((current) => current.filter((candidate) => candidate.id !== sessionId));
      if (
        session?.sourceRoute?.kind === "drafts" &&
        sameRoute(routeRef.current, session.sourceRoute)
      ) {
        navigateRef.current({ kind: "drafts", draftId: null });
      }
    },
    [updateSessions]
  );

  const minimizedSessions = sessions.filter((session) => session.minimized);
  const windowSessions = sessions.filter((session) => session.detached);

  return (
    <ComposerContext.Provider value={controls}>
      {children(controls)}
      <section aria-hidden className="hidden" data-composer-parking ref={setParkingTarget} />
      <section
        aria-label="Minimized composers"
        className="fixed bottom-0 right-4 z-[100] hidden w-fit max-w-[calc(100vw-2rem)] flex-row-reverse items-end gap-2 overflow-x-auto overscroll-x-contain lg:flex"
        data-composer-dock
        ref={setDockTarget}
      />
      {sessions.map((session) => {
        const origin = session.origin;
        const inlineTarget = session.detached ? null : (inlineTargets[session.id] ?? parkingTarget);
        const presentation = session.detached ? "window" : "thread";
        return (
          <React.Suspense fallback={null} key={session.id}>
            <ComposeDialog
              defaultFromMailboxId={defaultFromMailboxId}
              dockIndex={Math.max(
                0,
                minimizedSessions.findIndex((item) => item.id === session.id)
              )}
              dockTarget={dockTarget}
              draftId={session.initialDraftId}
              initialTo={session.initialTo}
              inlineTarget={inlineTarget}
              mailboxes={mailboxes}
              message={session.message}
              minimized={session.minimized}
              mode={session.mode}
              open
              presentation={presentation}
              threadContext={
                session.messages.length > 0 ? (
                  <ConversationMessages compact messages={session.messages} />
                ) : undefined
              }
              windowSlot={Math.max(
                0,
                windowSessions.length -
                  1 -
                  windowSessions.findIndex((item) => item.id === session.id)
              )}
              onDetach={
                presentation === "thread"
                  ? () => {
                      updateSessions((current) =>
                        current.map((candidate) =>
                          candidate.id === session.id
                            ? { ...candidate, detached: true, minimized: false }
                            : candidate
                        )
                      );
                    }
                  : undefined
              }
              onDraftReady={(draftId) => {
                updateSessions((current) =>
                  current.map((candidate) =>
                    candidate.id === session.id ? { ...candidate, draftId } : candidate
                  )
                );
              }}
              onDraftsChange={() => onDraftsChangeRef.current()}
              onManageSignatures={() => onManageSignaturesRef.current()}
              onMinimizedChange={(minimized) => {
                updateSessions((current) =>
                  current.map((candidate) =>
                    candidate.id === session.id ? { ...candidate, minimized } : candidate
                  )
                );
              }}
              onOpenChange={(open) => {
                if (!open) closeSession(session.id);
              }}
              onReturnToThread={
                origin
                  ? () => {
                      updateSessions((current) =>
                        current.map((candidate) =>
                          candidate.id === session.id
                            ? {
                                ...candidate,
                                detached: false,
                                minimized: false
                              }
                            : candidate
                        )
                      );
                      navigateRef.current({
                        kind: "mail",
                        folder: origin.folder,
                        messageId: origin.messageId
                      });
                    }
                  : undefined
              }
              onSent={() => {
                onSentRef.current();
                session.onSent?.();
              }}
            />
          </React.Suspense>
        );
      })}
    </ComposerContext.Provider>
  );
}

let composerSequence = 0;

function newComposerId(): string {
  composerSequence += 1;
  return `composer-${Date.now().toString(36)}-${composerSequence.toString(36)}`;
}

function sameRoute(left: AppRoute, right: AppRoute): boolean {
  return appRoutePath(left) === appRoutePath(right);
}
