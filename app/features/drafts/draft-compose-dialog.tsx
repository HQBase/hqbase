import * as React from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ComposeDialog } from "@/features/compose/compose-dialog";
import type { ComposeMode } from "@/features/compose/compose-state";
import { ComposeWindow } from "@/features/compose/compose-window";
import type { Mailbox } from "@/features/mailboxes/types";
import { getMessage } from "@/features/messages/api";
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
  mailboxes,
  onDraftsChange,
  onOpenChange,
  onSent
}: DraftComposeDialogProps): React.ReactElement {
  const mode: ComposeMode = draft.replyToMessageId
    ? "reply"
    : draft.forwardOfMessageId
      ? "forward"
      : "new";
  const contextMessageId = draft.replyToMessageId ?? draft.forwardOfMessageId;
  const [message, setMessage] = React.useState<MessageDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = React.useState(false);

  React.useEffect(() => {
    if (!contextMessageId) {
      setMessage(null);
      setError(null);
      return;
    }

    let active = true;
    setMessage(null);
    setError(null);
    void getMessage(contextMessageId)
      .then((nextMessage) => {
        if (active) setMessage(nextMessage);
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

  if (contextMessageId && !message) {
    return (
      <ComposeWindow
        open
        status={error ? "Draft unavailable" : "Loading draft"}
        title={mode === "reply" ? "Reply" : "Forward"}
        onOpenChange={onOpenChange}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          {error ? (
            <>
              <div className="space-y-1">
                <h2 className="text-sm font-medium">Draft context is unavailable</h2>
                <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
              </div>
              <Button size="sm" type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Back to drafts
              </Button>
              <Button
                disabled={isDiscarding}
                size="sm"
                type="button"
                variant="destructive"
                onClick={() => {
                  setIsDiscarding(true);
                  void deleteDraft(draft.id)
                    .then(() => {
                      onOpenChange(false);
                      onDraftsChange();
                    })
                    .catch((reason: unknown) => {
                      setError(
                        reason instanceof Error ? reason.message : "Draft could not be discarded."
                      );
                      setIsDiscarding(false);
                    });
                }}
              >
                {isDiscarding ? "Discarding…" : "Discard draft"}
              </Button>
            </>
          ) : (
            <>
              <Spinner />
              <span className="text-xs text-muted-foreground">Loading draft…</span>
            </>
          )}
        </div>
      </ComposeWindow>
    );
  }

  return (
    <ComposeDialog
      draftId={draft.id}
      mailboxes={mailboxes}
      message={message}
      mode={mode}
      open
      onDraftsChange={onDraftsChange}
      onOpenChange={onOpenChange}
      onSent={onSent}
    />
  );
}
