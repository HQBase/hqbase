import { Archive, ArrowLeft, Forward, MailOpen, Reply, Star, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import type { ComposeMode } from "@/features/compose/compose-state";
import type { Mailbox } from "@/features/mailboxes/types";
import { ConversationMessages } from "./conversation-messages";
import type { MessageDetail as MessageDetailType } from "./types";

const ComposeDialog = React.lazy(() =>
  import("@/features/compose/compose-dialog").then((module) => ({ default: module.ComposeDialog }))
);

type MessageDetailProps = {
  error?: string | null;
  isLoading?: boolean;
  mailboxes: Mailbox[];
  messages: MessageDetailType[];
  selectedId: string | null;
  onAction: (action: "read" | "unread" | "star" | "unstar" | "archive" | "trash") => void;
  onBack: () => void;
  onDraftsChange?: () => void;
  onSent: () => void;
};

export function MessageDetail({
  error = null,
  isLoading = false,
  mailboxes,
  messages,
  selectedId,
  onAction,
  onBack,
  onDraftsChange,
  onSent
}: MessageDetailProps): React.ReactElement {
  const [composeMode, setComposeMode] = React.useState<Extract<
    ComposeMode,
    "reply" | "forward"
  > | null>(null);

  if (isLoading) {
    return <MessageReaderStatus label="Loading conversation" />;
  }

  if (error) {
    return <MessageReaderStatus description={error} label="Conversation unavailable" />;
  }

  const selected = messages.find((message) => message.id === selectedId) ?? messages.at(-1) ?? null;
  if (!selected) {
    return <MessageReaderStatus label="Select a message" />;
  }
  const replyTarget =
    selected.direction === "inbound"
      ? selected
      : ([...messages].reverse().find((message) => message.direction === "inbound") ?? selected);
  const composeTarget = composeMode === "reply" ? replyTarget : selected;
  const isUnread = messages.some(
    (message) => message.direction === "inbound" && message.readAt === null
  );
  const isStarred = messages.some((message) => message.starredAt !== null);

  return (
    <article className="flex h-full flex-col bg-background">
      <div className="shrink-0 border-b bg-background px-3 py-3 sm:px-5">
        <div className="flex items-start gap-2">
          <Button
            aria-label="Back to messages"
            className="size-10 shrink-0 lg:hidden"
            size="icon"
            type="button"
            variant="ghost"
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <h1 className="min-w-0 flex-1 break-words pt-2 text-lg font-medium tracking-tight sm:text-xl lg:pt-1">
            {selected.subject}
          </h1>
          <div className="flex shrink-0 flex-wrap gap-0.5 rounded-md border bg-card p-0.5">
            <IconButton
              label={isUnread ? "Mark conversation read" : "Mark conversation unread"}
              onClick={() => onAction(isUnread ? "read" : "unread")}
            >
              <MailOpen />
            </IconButton>
            <IconButton
              label={isStarred ? "Unstar conversation" : "Star conversation"}
              onClick={() => onAction(isStarred ? "unstar" : "star")}
            >
              <Star />
            </IconButton>
            <IconButton label="Archive conversation" onClick={() => onAction("archive")}>
              <Archive />
            </IconButton>
            <IconButton label="Trash conversation" onClick={() => onAction("trash")}>
              <Trash2 />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ConversationMessages messages={messages} />
        <div className="px-4 pb-8 pt-2 sm:px-6">
          {composeMode ? (
            <React.Suspense
              fallback={
                <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">
                  Opening editor…
                </div>
              }
            >
              <ComposeDialog
                mailboxes={mailboxes}
                message={composeTarget}
                mode={composeMode}
                open
                presentation="thread"
                threadContext={<ConversationMessages compact messages={messages} />}
                {...(onDraftsChange ? { onDraftsChange } : {})}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) setComposeMode(null);
                }}
                onSent={onSent}
              />
            </React.Suspense>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:flex">
              <Button
                className="h-11 justify-center gap-2 px-5 lg:min-w-32"
                size="lg"
                type="button"
                variant="outline"
                onClick={() => setComposeMode("reply")}
              >
                <Reply />
                Reply
              </Button>
              <Button
                className="h-11 justify-center gap-2 px-5 lg:min-w-32"
                size="lg"
                type="button"
                variant="outline"
                onClick={() => setComposeMode("forward")}
              >
                <Forward />
                Forward
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function MessageReaderStatus({
  description,
  label
}: {
  description?: string;
  label: string;
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex size-9 items-center justify-center rounded-md border bg-card">
        <MailOpen className="size-4" />
      </div>
      <div className="grid max-w-sm gap-1">
        <span className="text-xs">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Button
      aria-label={label}
      className="size-9 text-muted-foreground hover:text-foreground"
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
