import { Download, MessagesSquare } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { MessageHtml, PlainTextMessage } from "./message-html";
import type { MessageDetail } from "./types";

export function ConversationMessages({
  compact = false,
  messages
}: {
  compact?: boolean;
  messages: MessageDetail[];
}): React.ReactElement {
  const hiddenCount = Math.max(0, messages.length - 2);
  const threadFingerprint = messages.map((message) => message.id).join(":");
  const [expandedThread, setExpandedThread] = React.useState<string | null>(null);
  const showMiddle = expandedThread === threadFingerprint;

  if (hiddenCount === 0) {
    return <div className="divide-y divide-border">{messages.map(renderMessage)}</div>;
  }

  const first = messages[0];
  const middle = messages.slice(1, -1);
  const final = messages.at(-1);
  return (
    <div className="divide-y divide-border">
      {first ? renderMessage(first) : null}
      <ThreadMessagesDivider
        count={hiddenCount}
        expanded={showMiddle}
        onToggle={() =>
          setExpandedThread((current) => (current === threadFingerprint ? null : threadFingerprint))
        }
      />
      {showMiddle ? middle.map(renderMessage) : null}
      {final ? renderMessage(final) : null}
    </div>
  );

  function renderMessage(message: MessageDetail): React.ReactElement {
    const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
    return (
      <article
        className={cn("px-4 py-5 sm:px-6 sm:py-6", compact && "px-4 py-4 sm:px-4 sm:py-4")}
        data-thread-message-id={message.id}
        key={message.id}
      >
        <header className="mb-5 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="break-words text-sm font-medium">{message.fromAddress}</div>
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
            <time className="font-mono text-[10px] text-muted-foreground">
              {formatDateTime(timestamp)}
            </time>
          </div>
        </header>
        <div className="max-w-3xl">
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
                    className="flex w-fit max-w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs hover:bg-muted"
                    href={`/api/attachments/${attachment.id}`}
                    key={attachment.id}
                  >
                    <Download className="size-3.5" />
                    <span className="truncate">{attachment.filename}</span>
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
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
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-6" data-thread-messages-control>
      <Separator className="flex-1" />
      <Button
        aria-expanded={expanded}
        className="shrink-0 rounded-full"
        onClick={onToggle}
        size="sm"
        type="button"
        variant="outline"
      >
        <MessagesSquare data-icon />
        {expanded ? `Hide ${count} ${noun}` : `${count} earlier ${noun}`}
      </Button>
      <Separator className="flex-1" />
    </div>
  );
}
