import type * as React from "react";
import { PiChats, PiPaperclip, PiStar } from "react-icons/pi";

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

  return (
    <a
      className={cn(
        "group flex w-full items-center gap-4 rounded-xl px-3 py-2 text-left text-[13px] leading-5 transition-colors [@media(hover:hover)]:hover:bg-hover focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
      <button
        aria-label={conversation.isStarred ? "Unstar conversation" : "Star conversation"}
        aria-pressed={conversation.isStarred}
        className={cn(
          "flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      <span className="flex w-[30%] min-w-0 max-w-[16rem] shrink-0 items-center gap-2">
        <span
          className={cn(
            "min-w-0 truncate",
            isUnread
              ? "font-bold text-foreground dark:text-white"
              : "font-normal text-foreground/85 dark:text-white/65"
          )}
        >
          {correspondentLabel(conversation)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span className="min-w-0 flex-1 truncate">
          <span
            className={cn(
              isUnread
                ? "font-semibold text-foreground dark:text-white"
                : "font-normal text-foreground/85 dark:text-white/65"
            )}
          >
            {conversation.subject || "No subject"}
          </span>
          <span
            className={cn(
              isUnread ? "text-foreground/75 dark:text-white/75" : "text-muted-foreground"
            )}
          >
            {" — "}
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
          "w-[5.75rem] shrink-0 text-right text-[12px] tabular-nums",
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
