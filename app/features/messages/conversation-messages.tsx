import * as React from "react";
import {
  PiArrowBendUpLeft,
  PiArrowBendUpRight,
  PiArrowDown,
  PiArrowUp,
  PiDownloadSimple
} from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { MessageHtml, PlainTextMessage } from "./message-html";
import type { MessageDetail } from "./types";

export function ConversationMessages({
  compact = false,
  messages,
  onCompose
}: {
  compact?: boolean;
  messages: MessageDetail[];
  onCompose?: (message: MessageDetail, mode: "reply" | "forward") => void;
}): React.ReactElement {
  const hiddenCount = Math.max(0, messages.length - 2);
  const threadFingerprint = messages.map((message) => message.id).join(":");
  const [expandedThread, setExpandedThread] = React.useState<string | null>(null);
  const showMiddle = expandedThread === threadFingerprint;
  const replyTarget =
    [...messages].reverse().find((message) => message.direction === "inbound") ?? messages.at(-1);

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
    <div className="divide-y divide-border">
      {first ? renderMessage(first, false) : null}
      <ThreadMessagesDivider
        count={hiddenCount}
        expanded={showMiddle}
        onToggle={() =>
          setExpandedThread((current) => (current === threadFingerprint ? null : threadFingerprint))
        }
      />
      {showMiddle ? middle.map((message) => renderMessage(message, false)) : null}
      {final ? renderMessage(final, true) : null}
    </div>
  );

  function renderMessage(message: MessageDetail, isLast: boolean): React.ReactElement {
    const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
    return (
      <article
        className={cn("px-4 py-5 sm:px-6 sm:py-6", compact && "px-4 py-4 sm:px-4 sm:py-4")}
        data-thread-message-id={message.id}
        key={message.id}
      >
        <header className="mb-5 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="break-words text-sm font-medium text-balance [text-wrap:balance]">
              {message.fromAddress}
            </div>
            <div className="mt-1 break-words text-xs text-muted-foreground">
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
          {message.attachments.length > 0 ? (
            <>
              <Separator className="my-6" />
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">Attachments</div>
                {message.attachments.map((attachment) => (
                  <a
                    className="flex w-fit max-w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs [@media(hover:hover)]:hover:bg-muted"
                    href={`/api/v1/attachments/${attachment.id}`}
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
        {onCompose && isLast ? (
          <footer className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              aria-label={`Reply to message from ${replyTarget?.fromAddress ?? message.fromAddress}`}
              className="h-9 min-w-24 rounded-full px-4"
              data-compose-action="reply"
              data-compose-message-id={replyTarget?.id ?? message.id}
              onClick={() => onCompose(replyTarget ?? message, "reply")}
              size="sm"
              type="button"
              variant="outline"
            >
              <PiArrowBendUpLeft />
              Reply
            </Button>
            <Button
              aria-label={`Forward message from ${message.fromAddress}`}
              className="h-9 min-w-24 rounded-full px-4"
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
          </footer>
        ) : null}
      </article>
    );
  }
}

function ThreadMessagesDivider({
  count,
  expanded,
  onToggle
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const noun = count === 1 ? "message" : "messages";
  const label = expanded ? `Collapse ${count} earlier ${noun}` : `Expand ${count} earlier ${noun}`;
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-6" data-thread-messages-control>
      <Separator className="flex-1" />
      <Button
        aria-label={label}
        aria-expanded={expanded}
        className="size-11 shrink-0 rounded-full p-0 [&_svg]:size-3.5"
        data-thread-disclosure-state={expanded ? "expanded" : "collapsed"}
        onClick={onToggle}
        size="icon"
        title={label}
        type="button"
        variant="outline"
      >
        <span
          aria-hidden="true"
          className="grid grid-rows-[0.875rem_0.875rem_0.875rem] place-items-center"
        >
          {expanded ? (
            <PiArrowDown data-thread-arrow="top-inward" />
          ) : (
            <PiArrowUp data-thread-arrow="top-outward" />
          )}
          <span className="min-w-4 text-center font-mono text-[10px] font-semibold leading-none tabular-nums">
            {count}
          </span>
          {expanded ? (
            <PiArrowUp data-thread-arrow="bottom-inward" />
          ) : (
            <PiArrowDown data-thread-arrow="bottom-outward" />
          )}
        </span>
      </Button>
      <Separator className="flex-1" />
    </div>
  );
}
