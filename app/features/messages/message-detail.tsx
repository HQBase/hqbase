import type * as React from "react";
import {
  PiArchive,
  PiArrowCounterClockwise,
  PiArrowLeft,
  PiDotsThree,
  PiEnvelopeOpen,
  PiStar,
  PiTag,
  PiTrash
} from "react-icons/pi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { ComposerInlineTarget, useComposer } from "@/features/compose/composer-host";
import { LabelMenu, LabelStack } from "@/features/labels/label-controls";
import type { MailLabel } from "@/features/labels/types";
import type { Mailbox } from "@/features/mailboxes/types";
import { cn } from "@/lib/cn";
import type { MailFolderId } from "@/lib/routes";
import { ConversationMessages } from "./conversation-messages";
import { IconButton, MessageReaderStatus } from "./message-reader-primitives";
import type { MessageDetail as MessageDetailType, MessageFolderAction } from "./types";

type MessageDetailProps = {
  activeFolder?: MailFolderId;
  defaultFromMailboxId: string | null;
  error?: string | null;
  isLoading?: boolean;
  canCreateLabels?: boolean;
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
  onLabelsChanged?: (() => Promise<void>) | undefined;
  onMessageAction?:
    | ((message: MessageDetailType, action: MessageFolderAction) => Promise<void> | void)
    | undefined;
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
  canCreateLabels = false,
  canOrganizeLabels = false,
  labels = [],
  messages,
  routeMessageId = null,
  selectedId,
  showBack = true,
  onAction,
  onBack,
  onLabelsChanged,
  onMessageAction,
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
  const assignedLabels = mergeMessageLabels(messages);
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
  async function applyMessageAction(
    message: MessageDetailType,
    action: MessageFolderAction
  ): Promise<void> {
    if (!onMessageAction) return;
    try {
      await onMessageAction(message, action);
      toast.success(messageActionSuccess(action));
    } catch {
      toast.error("The message could not be updated. Try again.");
    }
  }
  function renderReaderLabels(placement: "desktop" | "mobile"): React.ReactElement | null {
    const desktop = placement === "desktop";
    const wrapperClassName = desktop
      ? "hidden min-w-0 max-w-[min(28rem,40vw)] shrink-0 sm:block"
      : "flex justify-end px-4 pb-0 pt-1.5 sm:hidden";
    const controlClassName = desktop
      ? "h-10 min-h-10 max-w-full flex-row-reverse gap-1.5 overflow-hidden rounded-md bg-transparent px-2 py-0 shadow-none [&_svg]:-translate-y-px [@media(hover:hover)]:hover:text-foreground"
      : "max-w-full flex-row-reverse gap-1.5 overflow-hidden bg-muted/40 px-1 [&_svg]:-translate-y-px [@media(hover:hover)]:hover:bg-muted/60";
    if (labels.length === 0 && assignedLabels.length === 0 && !canCreateLabels) return null;
    return (
      <div className={wrapperClassName} data-reader-labels={placement}>
        {(labels.length > 0 || canCreateLabels) && onToggleLabel && canOrganizeLabels ? (
          <LabelMenu
            align="end"
            assigned={assignedLabels}
            canCreateLabels={canCreateLabels}
            canOrganizeLabels={canOrganizeLabels}
            className={cn(
              controlClassName,
              !desktop && assignedLabels.length === 0 && "border border-dashed border-divider"
            )}
            compactAssignedLabels={false}
            emptyAssignedText="Add label"
            labels={labels}
            onLabelsChanged={onLabelsChanged}
            onToggle={onToggleLabel}
            showAssignedLabels
            showTagIcon
          />
        ) : (
          <span
            className={cn(
              "inline-flex w-fit max-w-full items-center gap-1.5 overflow-hidden text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
              desktop
                ? "h-10 min-h-10 rounded-md bg-transparent px-2 py-0"
                : "h-auto min-h-0 rounded-full bg-muted/40 p-0.5 px-1"
            )}
          >
            <PiTag aria-hidden="true" className="pointer-events-none -translate-y-px" />
            <LabelStack labels={assignedLabels} />
          </span>
        )}
      </div>
    );
  }

  return (
    <article className="flex h-full flex-col bg-reader">
      <div className="shrink-0 border-b border-divider bg-toolbar px-3 sm:px-5">
        <div className="relative flex h-11 items-center gap-2 py-2">
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
          <h1 className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium leading-none tracking-tight">
            {selected.subject}
          </h1>
          <div className="absolute inset-y-0 right-0 z-10 flex shrink-0 items-center gap-0.5 bg-toolbar shadow-[-10px_0_8px_2px_hsl(var(--surface-toolbar))] sm:static sm:flex-wrap sm:bg-transparent sm:shadow-none">
            {renderReaderLabels("desktop")}
            <IconButton
              className="hidden sm:inline-flex"
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
                className="hidden sm:inline-flex"
                label="Restore conversation"
                onClick={() => void applyAction("restore", "Conversation restored.")}
              >
                <PiArrowCounterClockwise aria-hidden="true" className="pointer-events-none" />
              </IconButton>
            ) : (
              <>
                <IconButton
                  className="hidden sm:inline-flex"
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
                  className="hidden sm:inline-flex"
                  label="Trash conversation"
                  onClick={() => void applyAction("trash", "Conversation moved to Trash.")}
                >
                  <PiTrash aria-hidden="true" className="pointer-events-none" />
                </IconButton>
              </>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="More conversation actions"
                  className="size-10 min-h-10 min-w-10 text-muted-foreground [@media(hover:hover)]:hover:text-foreground sm:hidden"
                  size="icon"
                  title="More conversation actions"
                  type="button"
                  variant="ghost"
                >
                  <PiDotsThree aria-hidden="true" className="pointer-events-none" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 p-1 text-sm"
                data-mobile-thread-actions
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="min-h-10 gap-2"
                    data-mobile-thread-action={isUnread ? "read" : "unread"}
                    onSelect={() => {
                      const action = isUnread ? "read" : "unread";
                      void applyAction(
                        action,
                        action === "read" ? "Marked as read." : "Marked as unread."
                      );
                    }}
                  >
                    <PiEnvelopeOpen aria-hidden="true" className="size-4" />
                    {isUnread ? "Mark conversation read" : "Mark Unread"}
                  </DropdownMenuItem>
                  {isTrash ? (
                    <DropdownMenuItem
                      className="min-h-10 gap-2"
                      data-mobile-thread-action="restore"
                      onSelect={() => void applyAction("restore", "Conversation restored.")}
                    >
                      <PiArrowCounterClockwise aria-hidden="true" className="size-4" />
                      Restore conversation
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="min-h-10 gap-2"
                      data-mobile-thread-action={isArchived ? "unarchive" : "archive"}
                      onSelect={() =>
                        void applyAction(
                          isArchived ? "unarchive" : "archive",
                          isArchived ? "Conversation unarchived." : "Conversation archived."
                        )
                      }
                    >
                      {isArchived ? (
                        <PiArrowCounterClockwise aria-hidden="true" className="size-4" />
                      ) : (
                        <PiArchive aria-hidden="true" className="size-4" />
                      )}
                      {isArchived ? "Unarchive conversation" : "Archive conversation"}
                    </DropdownMenuItem>
                  )}
                  {!isTrash ? (
                    <DropdownMenuItem
                      className="min-h-10 gap-2"
                      data-mobile-thread-action="trash"
                      onSelect={() => void applyAction("trash", "Conversation moved to Trash.")}
                    >
                      <PiTrash aria-hidden="true" className="size-4" />
                      Trash conversation
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <PullToRefresh className="min-h-0 flex-1" onRefresh={onRefresh}>
        {renderReaderLabels("mobile")}
        <ConversationMessages
          messages={messages}
          {...(onMessageAction ? { onMessageAction: applyMessageAction } : {})}
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

function messageActionSuccess(action: MessageFolderAction): string {
  if (action === "archive") return "Message archived.";
  if (action === "unarchive") return "Message unarchived.";
  if (action === "trash") return "Message moved to Trash.";
  return "Message restored.";
}

function mergeMessageLabels(messages: MessageDetailType[]): MailLabel[] {
  const byId = new Map<string, MailLabel>();
  for (const message of messages) {
    for (const label of message.labels ?? []) byId.set(label.id, label);
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
}
