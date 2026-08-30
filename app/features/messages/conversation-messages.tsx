import * as React from "react";
import {
  PiArchive,
  PiArrowBendUpLeft,
  PiArrowBendUpRight,
  PiArrowCounterClockwise,
  PiArrowDownBold,
  PiArrowUpBold,
  PiDotsThree,
  PiDownloadSimple,
  PiTrash
} from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { MessageHtml, PlainTextMessage } from "./message-html";
import type { MessageDetail, MessageFolderAction } from "./types";

export function ConversationMessages({
  compact = false,
  messages,
  onCompose,
  onMessageAction
}: {
  compact?: boolean;
  messages: MessageDetail[];
  onCompose?: (message: MessageDetail, mode: "reply" | "forward") => void;
  onMessageAction?:
    | ((message: MessageDetail, action: MessageFolderAction) => Promise<void> | void)
    | undefined;
}): React.ReactElement {
  const hiddenCount = Math.max(0, messages.length - 2);
  const threadId = messages[0]?.threadId ?? null;
  const [expandedThreadId, setExpandedThreadId] = React.useState<string | null>(null);
  const previousThreadId = React.useRef(threadId);
  const showMiddle = threadId !== null && expandedThreadId === threadId;
  const [pendingMessageId, setPendingMessageId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (previousThreadId.current === threadId) return;
    previousThreadId.current = threadId;
    setExpandedThreadId(null);
  }, [threadId]);

  if (hiddenCount === 0) {
    return (
      <div className="divide-y divide-border">
        {messages.map((message, index) => renderMessage(message, index === messages.length - 1))}
      </div>
    );
  }

  const first = messages[0];
  const middle = messages.slice(1, -1);
  const final = messages.at(-1);
  return (
    <div className={showMiddle ? "divide-y divide-border" : undefined}>
      {first ? renderMessage(first, false) : null}
      {showMiddle ? null : (
        <ThreadMessagesDivider
          count={hiddenCount}
          onExpand={() => {
            if (threadId) setExpandedThreadId(threadId);
          }}
        />
      )}
      {showMiddle ? middle.map((message) => renderMessage(message, false)) : null}
      {final ? renderMessage(final, true) : null}
    </div>
  );

  function renderMessage(message: MessageDetail, isLast: boolean): React.ReactElement {
    const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
    const downloadableAttachments = message.attachments.filter(
      (attachment) => attachment.disposition === "attachment"
    );
    return (
      <article
        className={cn(
          compact ? "px-4 py-4 sm:px-4 sm:py-4" : "px-4 pb-5 sm:px-6 sm:py-6",
          !compact && (message === messages[0] ? "pt-2" : "pt-5")
        )}
        data-thread-message-id={message.id}
        key={message.id}
      >
        <header className="mb-5 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="break-words text-sm font-medium text-balance [text-wrap:balance]">
              {message.fromName ?? message.fromAddress}
            </div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
              {message.fromName ? `${message.fromAddress} · ` : ""}
              to {message.to.join(", ")}
              {message.cc.length > 0 ? ` · cc ${message.cc.join(", ")}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {message.direction === "outbound" ? (
              <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                Sent
              </Badge>
            ) : null}
            <time className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatDateTime(timestamp)}
            </time>
          </div>
        </header>
        <div className="min-w-0">
          {message.htmlAvailable ? (
            <MessageHtml message={message} />
          ) : (
            <PlainTextMessage message={message} />
          )}
          {downloadableAttachments.length > 0 ? (
            <>
              <Separator className="my-6" />
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">Attachments</div>
                {downloadableAttachments.map((attachment) => (
                  <a
                    className="flex w-fit max-w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs [@media(hover:hover)]:hover:bg-muted"
                    href={`/api/v2/attachments/${attachment.id}`}
                    key={attachment.id}
                  >
                    <PiDownloadSimple className="size-3.5" />
                    <span className="truncate">{attachment.filename}</span>
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
        {onCompose || onMessageAction ? (
          <footer className="mt-5 flex flex-wrap items-center gap-2">
            {onCompose ? (
              <>
                <Button
                  aria-label={`Reply to message from ${message.fromAddress}`}
                  className={cn(
                    "rounded-full",
                    isLast ? "h-9 min-w-24 px-4" : "h-8 min-w-0 px-3 text-xs"
                  )}
                  data-compose-action="reply"
                  data-compose-message-id={message.id}
                  onClick={() => onCompose(message, "reply")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PiArrowBendUpLeft />
                  Reply
                </Button>
                <Button
                  aria-label={`Forward message from ${message.fromAddress}`}
                  className={cn(
                    "rounded-full",
                    isLast ? "h-9 min-w-24 px-4" : "h-8 min-w-0 px-3 text-xs"
                  )}
                  data-compose-action="forward"
                  data-compose-message-id={message.id}
                  onClick={() => onCompose(message, "forward")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PiArrowBendUpRight />
                  Forward
                </Button>
              </>
            ) : null}
            {onMessageAction ? (
              <MessageActions
                isLast={isLast}
                message={message}
                pending={pendingMessageId !== null}
                onAction={async (action) => {
                  setPendingMessageId(message.id);
                  try {
                    await onMessageAction(message, action);
                  } finally {
                    setPendingMessageId(null);
                  }
                }}
              />
            ) : null}
          </footer>
        ) : null}
      </article>
    );
  }
}

function MessageActions({
  isLast,
  message,
  pending,
  onAction
}: {
  isLast: boolean;
  message: MessageDetail;
  pending: boolean;
  onAction: (action: MessageFolderAction) => Promise<void> | void;
}): React.ReactElement {
  const restoreAction = message.folder === "trash" ? "restore" : "unarchive";
  const restoreLabel = message.folder === "trash" ? "Restore message" : "Unarchive message";
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`More actions for message from ${message.fromAddress}`}
          className={cn(
            "rounded-full",
            isLast ? "size-9 min-h-9 min-w-9" : "size-8 min-h-8 min-w-8"
          )}
          data-message-actions-id={message.id}
          disabled={pending}
          size="icon"
          type="button"
          variant="outline"
        >
          <PiDotsThree aria-hidden="true" className="pointer-events-none" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52 p-1 text-sm"
        data-message-actions-menu={message.id}
      >
        <DropdownMenuGroup>
          {message.folder === "archived" || message.folder === "trash" ? (
            <DropdownMenuItem
              className="min-h-10 gap-2"
              data-message-action={restoreAction}
              data-message-id={message.id}
              onSelect={() => void onAction(restoreAction)}
            >
              <PiArrowCounterClockwise aria-hidden="true" className="size-4" />
              {restoreLabel}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="min-h-10 gap-2"
              data-message-action="archive"
              data-message-id={message.id}
              onSelect={() => void onAction("archive")}
            >
              <PiArchive aria-hidden="true" className="size-4" />
              Archive message
            </DropdownMenuItem>
          )}
          {message.folder !== "trash" ? (
            <DropdownMenuItem
              className="min-h-10 gap-2"
              data-message-action="trash"
              data-message-id={message.id}
              onSelect={() => void onAction("trash")}
            >
              <PiTrash aria-hidden="true" className="size-4" />
              Move message to Trash
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThreadMessagesDivider({
  count,
  onExpand
}: {
  count: number;
  onExpand: () => void;
}): React.ReactElement {
  const noun = count === 1 ? "message" : "messages";
  const label = `Expand ${count} earlier ${noun}`;
  return (
    <div className="flex items-center gap-2 px-4 py-2 sm:px-6" data-thread-messages-control>
      <Separator className="flex-1" />
      <button
        aria-label={label}
        aria-expanded="false"
        className="group inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-thread-disclosure-state="collapsed"
        onClick={onExpand}
        title={label}
        type="button"
      >
        <span
          aria-hidden="true"
          className="grid size-8 grid-rows-[0.625rem_0.75rem_0.625rem] place-items-center rounded-full bg-muted transition-colors group-hover:bg-muted/80 group-hover:text-foreground"
        >
          <PiArrowUpBold className="size-2.5" data-thread-arrow="top-outward" />
          <span className="min-w-4 text-center font-mono text-[9px] font-semibold leading-none tabular-nums">
            {count}
          </span>
          <PiArrowDownBold className="size-2.5" data-thread-arrow="bottom-outward" />
        </span>
      </button>
      <Separator className="flex-1" />
    </div>
  );
}
