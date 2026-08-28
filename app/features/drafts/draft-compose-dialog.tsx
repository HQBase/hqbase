import * as React from "react";
import { PiArrowLeft } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ComposeMode } from "@/features/compose/compose-state";
import { ComposerInlineTarget, useComposer } from "@/features/compose/composer-host";
import type { Mailbox } from "@/features/mailboxes/types";
import { getMessageThread } from "@/features/messages/api";
import { ConversationMessages } from "@/features/messages/conversation-messages";
import type { MessageDetail } from "@/features/messages/types";

import { deleteDraft } from "./api";
import type { Draft } from "./types";

type DraftComposeDialogProps = {
  draft: Draft;
  mailboxes: Mailbox[];
  onDraftsChange: () => void;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
};

export function DraftComposeDialog({
  draft,
  onDraftsChange,
  onOpenChange
}: DraftComposeDialogProps): React.ReactElement | null {
  const { openDraft } = useComposer();
  const mode: ComposeMode = draft.replyToMessageId
    ? "reply"
    : draft.forwardOfMessageId
      ? "forward"
      : "new";
  const contextMessageId = draft.replyToMessageId ?? draft.forwardOfMessageId;
  const [messages, setMessages] = React.useState<MessageDetail[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!contextMessageId) {
      setMessages([]);
      setError(null);
      return;
    }

    let active = true;
    setMessages([]);
    setError(null);
    void getMessageThread(contextMessageId)
      .then((nextMessages) => {
        if (!nextMessages.some((message) => message.id === contextMessageId)) {
          throw new Error("The message this draft targets is unavailable.");
        }
        if (active) setMessages(nextMessages);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Draft context could not be opened.");
        }
      });
    return () => {
      active = false;
    };
  }, [contextMessageId]);

  const message = messages.find((candidate) => candidate.id === contextMessageId) ?? null;

  React.useEffect(() => {
    if (contextMessageId && !message) return;
    const route = { kind: "drafts", draftId: draft.id } as const;
    setSessionId(
      openDraft({
        draftId: draft.id,
        message,
        messages,
        mode,
        origin: message
          ? { folder: message.folder, messageId: message.id, threadId: message.threadId }
          : null,
        route
      })
    );
  }, [contextMessageId, draft.id, message, messages, mode, openDraft]);

  if (!contextMessageId) return null;

  if (!message) {
    return (
      <DraftContextStatus
        error={error}
        isDiscarding={isDiscarding}
        subject={draft.subject}
        onBack={() => onOpenChange(false)}
        onDiscard={() => {
          setIsDiscarding(true);
          void deleteDraft(draft.id)
            .then(() => {
              onOpenChange(false);
              onDraftsChange();
            })
            .catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "Draft could not be discarded.");
              setIsDiscarding(false);
            });
        }}
      />
    );
  }

  return (
    <article className="flex h-full flex-col bg-reader">
      <DraftThreadHeader subject={message.subject} onBack={() => onOpenChange(false)} />
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <ConversationMessages messages={messages} />
        <div className="px-4 pb-8 pt-2 sm:px-6">
          {sessionId ? <ComposerInlineTarget sessionId={sessionId} /> : null}
        </div>
      </div>
    </article>
  );
}

function DraftThreadHeader({
  subject,
  onBack
}: {
  subject: string;
  onBack: () => void;
}): React.ReactElement {
  return (
    <div className="shrink-0 border-b border-divider bg-toolbar px-3 sm:px-5">
      <div className="flex h-11 items-center gap-2 py-2">
        <Button
          aria-label="Back to drafts"
          className="size-10 min-h-10 min-w-10 shrink-0 bg-transparent text-tertiary [@media(hover:hover)]:hover:bg-selected [@media(hover:hover)]:hover:text-foreground"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onBack}
        >
          <PiArrowLeft aria-hidden="true" className="pointer-events-none size-3.5" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{subject}</h1>
      </div>
    </div>
  );
}

function DraftContextStatus({
  error,
  isDiscarding,
  subject,
  onBack,
  onDiscard
}: {
  error: string | null;
  isDiscarding: boolean;
  subject: string;
  onBack: () => void;
  onDiscard: () => void;
}): React.ReactElement {
  return (
    <article aria-busy={!error} className="flex h-full flex-col bg-reader">
      <DraftThreadHeader subject={subject || "Draft"} onBack={onBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        {error ? (
          <>
            <div className="space-y-1">
              <h2 className="text-sm font-medium">Draft context is unavailable</h2>
              <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" type="button" variant="outline" onClick={onBack}>
                Back to drafts
              </Button>
              <Button
                disabled={isDiscarding}
                size="sm"
                type="button"
                variant="destructive"
                onClick={onDiscard}
              >
                {isDiscarding ? "Discarding…" : "Discard draft"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Spinner />
            <span className="text-xs text-muted-foreground">Loading conversation…</span>
          </>
        )}
      </div>
    </article>
  );
}
