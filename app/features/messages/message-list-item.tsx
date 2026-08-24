import type * as React from "react";
import { PiChats, PiPaperclip, PiStar } from "react-icons/pi";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  onSelect: (conversation: ConversationSummary) => void;
  onToggleStar: (conversation: ConversationSummary) => void;
};

export function MessageListItem({
  activeFolder,
  conversation,
  href,
  isActive,
  onSelect,
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
        "group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-start gap-x-3 rounded-none py-3 text-left text-[14px] leading-5 transition-colors [@media(hover:hover)]:hover:bg-hover focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex sm:items-center sm:gap-4 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[13px]",
        isActive && "bg-selected"
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
      <button
        aria-label={conversation.isStarred ? "Unstar conversation" : "Star conversation"}
        aria-pressed={conversation.isStarred}
        className={cn(
          "col-start-3 row-start-2 flex size-10 min-h-10 min-w-10 shrink-0 self-end justify-self-end items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-auto sm:row-auto sm:self-auto sm:justify-self-auto",
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
      <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 sm:w-[30%] sm:max-w-[16rem] sm:shrink-0">
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
      <span className="col-start-2 row-start-2 flex min-w-0 items-end gap-2 overflow-hidden sm:flex-1 sm:items-center">
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
            className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-tertiary"
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
        {activeFolder === "catchall" ? (
          <Badge className="h-5 shrink-0 px-1.5 text-[10px]" variant="outline">
            Unknown
          </Badge>
        ) : null}
      </span>
      <time
        className={cn(
          "col-start-3 row-start-1 shrink-0 text-right text-[11px] tabular-nums sm:w-[5.75rem] sm:text-[12px]",
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
