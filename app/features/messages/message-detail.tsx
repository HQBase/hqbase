import type * as React from "react";
import {
  PiArchive,
  PiArrowCounterClockwise,
  PiArrowLeft,
  PiEnvelopeOpen,
  PiStar,
  PiTrash
} from "react-icons/pi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { ComposerInlineTarget, useComposer } from "@/features/compose/composer-host";
import { LabelBadges, LabelMenu } from "@/features/labels/label-controls";
import type { MailLabel } from "@/features/labels/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { MailFolderId } from "@/lib/routes";
import { ConversationMessages } from "./conversation-messages";
import type { MessageDetail as MessageDetailType } from "./types";

type MessageDetailProps = {
  activeFolder?: MailFolderId;
  defaultFromMailboxId: string | null;
  error?: string | null;
  isLoading?: boolean;
  canOrganizeLabels?: boolean;
  labels?: MailLabel[];
  mailboxes: Mailbox[];
  messages: MessageDetailType[];
  routeMessageId?: string | null;
  selectedId: string | null;
  showBack?: boolean;
  onAction: (action: MessageAction) => Promise<void> | void;
  onBack: () => void;
  onDraftsChange?: () => void;
  onRefresh: () => Promise<void> | void;
  onSent: () => void;
  onToggleLabel?: (label: MailLabel, assigned: boolean) => Promise<void> | void;
};

type MessageAction =
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "archive"
  | "unarchive"
  | "trash"
  | "restore";

export function MessageDetail({
  activeFolder,
  error = null,
  isLoading = false,
  canOrganizeLabels = false,
  labels = [],
  messages,
  routeMessageId = null,
  selectedId,
  showBack = true,
  onAction,
  onBack,
  onRefresh,
  onSent,
  onToggleLabel
}: MessageDetailProps): React.ReactElement {
  const composer = useComposer();

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
  const isUnread = messages.some(
    (message) => message.direction === "inbound" && message.readAt === null
  );

  const isStarred = messages.some((message) => message.starredAt !== null);
  const isArchived = activeFolder === "archived";
  const isTrash = activeFolder === "trash";
  const inlineSessions = composer.sessions.filter(
    (session) => !session.detached && session.origin?.threadId === selected.threadId
  );

  async function applyAction(action: MessageAction, successMessage?: string): Promise<void> {
    try {
      await onAction(action);
      if (successMessage) toast.success(successMessage);
    } catch {
      toast.error("The conversation could not be updated. Try again.");
    }
  }

  return (
    <article className="flex h-full flex-col bg-reader">
      <div className="shrink-0 border-b border-divider bg-toolbar px-3 sm:px-5">
        <div className="flex h-11 items-center gap-2 py-2">
          {showBack ? (
            <Button
              aria-label="Back to messages"
              className="size-10 min-h-10 min-w-10 shrink-0 bg-transparent text-tertiary [@media(hover:hover)]:hover:bg-selected [@media(hover:hover)]:hover:text-foreground"
              size="icon"
              type="button"
              variant="ghost"
              onClick={onBack}
            >
              <PiArrowLeft aria-hidden="true" className="pointer-events-none size-3.5" />
            </Button>
          ) : null}
          <h1 className="min-w-0 flex-1 break-words text-balance text-sm font-medium leading-none tracking-tight [text-wrap:balance] sm:text-sm">
            {selected.subject}
          </h1>
          <div className="flex shrink-0 flex-wrap items-center gap-0.5">
            {labels.length > 0 && onToggleLabel ? (
              <LabelMenu
                assigned={mergeMessageLabels(messages)}
                canOrganizeLabels={canOrganizeLabels}
                labels={labels}
                onToggle={onToggleLabel}
              />
            ) : null}
            <IconButton
              label={isUnread ? "Mark conversation read" : "Mark conversation unread"}
              onClick={() => {
                const action = isUnread ? "read" : "unread";
                void applyAction(
                  action,
                  action === "read" ? "Marked as read." : "Marked as unread."
                );
              }}
            >
              <PiEnvelopeOpen aria-hidden="true" className="pointer-events-none" />
            </IconButton>
            <IconButton
              active={isStarred}
              activeClassName="text-star [@media(hover:hover)]:hover:text-star"
              label={isStarred ? "Unstar conversation" : "Star conversation"}
              onClick={() => void applyAction(isStarred ? "unstar" : "star")}
            >
              <PiStar
                aria-hidden="true"
                className={`pointer-events-none ${isStarred ? "fill-star" : ""}`}
              />
            </IconButton>
            {isTrash ? (
              <IconButton
                label="Restore conversation"
                onClick={() => void applyAction("restore", "Conversation restored.")}
              >
                <PiArrowCounterClockwise aria-hidden="true" className="pointer-events-none" />
              </IconButton>
            ) : (
              <>
                <IconButton
                  label={isArchived ? "Unarchive conversation" : "Archive conversation"}
                  onClick={() =>
                    void applyAction(
                      isArchived ? "unarchive" : "archive",
                      isArchived ? "Conversation unarchived." : "Conversation archived."
                    )
                  }
                >
                  {isArchived ? (
                    <PiArrowCounterClockwise aria-hidden="true" className="pointer-events-none" />
                  ) : (
                    <PiArchive aria-hidden="true" className="pointer-events-none" />
                  )}
                </IconButton>
                <IconButton
                  label="Trash conversation"
                  onClick={() => void applyAction("trash", "Conversation moved to Trash.")}
                >
                  <PiTrash aria-hidden="true" className="pointer-events-none" />
                </IconButton>
              </>
            )}
          </div>
        </div>
      </div>
      <PullToRefresh className="min-h-0 flex-1" onRefresh={onRefresh}>
        {mergeMessageLabels(messages).length > 0 ? (
          <div className="px-4 pt-4 sm:px-6">
            <LabelBadges labels={mergeMessageLabels(messages)} />
          </div>
        ) : null}
        <ConversationMessages
          messages={messages}
          onCompose={(message, mode) => {
            const folder = activeFolder ?? message.folder;
            const messageId = routeMessageId ?? selectedId ?? message.id;
            composer.openContext({
              message,
              messages,
              mode,
              onSent,
              origin: { folder, messageId, threadId: message.threadId },
              route: { kind: "mail", folder, messageId }
            });
          }}
        />
        {inlineSessions.map((session) => (
          <div className="px-4 pb-8 pt-2 sm:px-6" key={session.id}>
            <ComposerInlineTarget sessionId={session.id} />
          </div>
        ))}
      </PullToRefresh>
    </article>
  );
}

function mergeMessageLabels(messages: MessageDetailType[]): MailLabel[] {
  const byId = new Map<string, MailLabel>();
  for (const message of messages) {
    for (const label of message.labels ?? []) byId.set(label.id, label);
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
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
        <PiEnvelopeOpen aria-hidden="true" className="pointer-events-none size-4" />
      </div>
      <div className="grid max-w-sm gap-1">
        <span className="text-xs">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
    </div>
  );
}

function IconButton({
  active = false,
  activeClassName = "",
  children,
  label,
  onClick
}: {
  active?: boolean;
  activeClassName?: string;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  const base =
    "size-10 min-h-10 min-w-10 text-muted-foreground [@media(hover:hover)]:hover:text-foreground";
  return (
    <Button
      aria-label={label}
      aria-pressed={active || undefined}
      className={active ? `${base} ${activeClassName}` : base}
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
