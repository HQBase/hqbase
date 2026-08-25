import type * as React from "react";
import { PiChats, PiPaperclip, PiStar } from "react-icons/pi";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LabelMenu, LabelStack } from "@/features/labels/label-controls";
import type { MailLabel } from "@/features/labels/types";
import { cn } from "@/lib/cn";
import { formatConversationTimestamp } from "@/lib/format";
import type { MailFolderId } from "@/lib/routes";
import { conversationActivityTimestamp, correspondentLabel } from "./conversation-display";
import type { ConversationSummary } from "./types";

type MessageListItemProps = {
  activeFolder: MailFolderId;
  conversation: ConversationSummary;
  href: string;
  isActive: boolean;
  canOrganizeLabels?: boolean;
  labels?: MailLabel[];
  onSelect: (conversation: ConversationSummary) => void;
  onToggleLabel?: (label: MailLabel, assigned: boolean) => Promise<void> | void;
  onToggleStar: (conversation: ConversationSummary) => void;
};

export function MessageListItem({
  activeFolder,
  conversation,
  href,
  isActive,
  canOrganizeLabels = false,
  labels = [],
  onSelect,
  onToggleLabel,
  onToggleStar
}: MessageListItemProps): React.ReactElement {
  const isUnread = conversation.unreadCount > 0;
  const timestamp = formatConversationTimestamp(conversationActivityTimestamp(conversation));
  const correspondent = correspondentLabel(conversation);
  const avatarInitial =
    correspondent
      .replace(/^To:\s*/u, "")
      .charAt(0)
      .toUpperCase() || "?";

  return (
    <a
      className={cn(
        "group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_5rem] items-start gap-x-3 rounded-xl px-3 py-3 text-left text-[14px] leading-5 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[2rem_minmax(7rem,18%)_minmax(0,1fr)_auto_4.5rem] sm:items-center sm:gap-x-1.5 sm:py-2 sm:text-[13px]",
        isActive
          ? "bg-selected [@media(hover:hover)]:hover:bg-selected"
          : "[@media(hover:hover)]:hover:bg-hover"
      )}
      href={href}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onSelect(conversation);
      }}
    >
      <Avatar
        aria-hidden="true"
        className="row-span-2 size-10 sm:hidden"
        data-message-avatar="mobile"
      >
        <AvatarFallback className="font-medium uppercase">{avatarInitial}</AvatarFallback>
      </Avatar>
      <span className="col-start-3 row-start-2 flex shrink-0 self-end justify-self-end sm:col-start-1 sm:row-start-1 sm:self-center sm:justify-self-auto">
        <button
          aria-label={conversation.isStarred ? "Unstar conversation" : "Star conversation"}
          aria-pressed={conversation.isStarred}
          className={cn(
            "flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-8 sm:min-h-8 sm:min-w-8",
            conversation.isStarred
              ? "text-star"
              : "text-muted-foreground/45 [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-muted-foreground group-hover:text-muted-foreground"
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleStar(conversation);
          }}
          title={conversation.isStarred ? "Starred" : "Not starred"}
          type="button"
        >
          <PiStar
            aria-hidden="true"
            className={cn("pointer-events-none size-4", conversation.isStarred && "fill-star")}
          />
        </button>
      </span>
      <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 sm:col-start-2 sm:row-start-1">
        <span
          className={cn(
            "min-w-0 truncate",
            isUnread
              ? "font-bold text-foreground dark:text-white"
              : "font-normal text-foreground/85 dark:text-white/65"
          )}
        >
          {correspondent}
        </span>
      </span>
      <span className="relative col-start-2 row-start-2 flex min-w-0 items-end gap-2 overflow-hidden sm:col-start-3 sm:row-start-1 sm:h-8 sm:items-center">
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate sm:inline",
              isUnread
                ? "font-semibold text-foreground dark:text-white"
                : "font-normal text-foreground/85 dark:text-white/65"
            )}
          >
            {conversation.subject || "No subject"}
          </span>
          <span
            className={cn(
              "block truncate sm:inline",
              isUnread ? "text-foreground/75 dark:text-white/75" : "text-muted-foreground"
            )}
          >
            <span className="hidden sm:inline">{" — "}</span>
            {conversation.snippet || "No preview"}
          </span>
        </span>
        {conversation.messageCount > 1 ? (
          <span
            className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-tertiary sm:hidden"
            title={`${conversation.messageCount} messages`}
          >
            {conversation.messageCount}
          </span>
        ) : null}
        {conversation.hasAttachments ? (
          <PiPaperclip
            aria-label="Has attachments"
            className="pointer-events-none size-3.5 shrink-0 text-tertiary sm:hidden"
          />
        ) : null}
        {activeFolder === "catchall" ? (
          <Badge className="h-5 shrink-0 px-1.5 text-[10px]" variant="outline">
            Unknown
          </Badge>
        ) : null}
        {(conversation.labels?.length ?? 0) > 0 || (labels.length > 0 && onToggleLabel) ? (
          <span className="group/label-pill absolute right-0 top-1/2 z-10 flex w-fit min-w-0 max-w-[75%] -translate-y-1/2 items-center justify-end gap-0.5 rounded-full bg-background/60 p-0.5 shadow-sm backdrop-blur-md">
            <LabelStack
              className="sm:hidden"
              compact
              labels={conversation.labels ?? []}
              namedLimit={0}
            />
            <LabelStack className="hidden sm:flex" compact labels={conversation.labels ?? []} />
            {labels.length > 0 && onToggleLabel ? (
              <LabelMenu
                assigned={conversation.labels ?? []}
                canOrganizeLabels={canOrganizeLabels}
                className="bg-transparent shadow-none group-hover/label-pill:text-foreground/80 [@media(hover:hover)]:hover:bg-transparent [@media(hover:hover)]:hover:text-foreground/80 sm:size-5 sm:min-h-5 sm:min-w-5"
                labels={labels}
                onToggle={onToggleLabel}
                showTagIcon
              />
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="hidden min-w-0 items-center justify-center gap-1 sm:col-start-4 sm:row-start-1 sm:flex">
        {conversation.messageCount > 1 ? (
          <span
            className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-tertiary"
            title={`${conversation.messageCount} messages`}
          >
            {conversation.messageCount}
          </span>
        ) : null}
        {conversation.hasAttachments ? (
          <PiPaperclip
            aria-label="Has attachments"
            className="pointer-events-none size-3.5 shrink-0 text-tertiary"
          />
        ) : null}
      </span>
      <time
        className={cn(
          "col-start-3 row-start-1 shrink-0 text-right text-[11px] tabular-nums sm:col-start-5 sm:row-start-1 sm:text-[12px]",
          isUnread ? "font-medium text-foreground dark:text-white" : "text-muted-foreground"
        )}
      >
        {timestamp}
      </time>
    </a>
  );
}

export function EmptyMessageList(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex size-9 items-center justify-center rounded-md border border-divider bg-reader">
        <PiChats className="size-4" />
      </div>
      <div className="text-xs">No conversations in this view</div>
    </div>
  );
}
