import { Download } from "lucide-react";
import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { MessageHtml } from "./message-html";
import type { MessageDetail } from "./types";

export function ConversationMessages({
  compact = false,
  messages
}: {
  compact?: boolean;
  messages: MessageDetail[];
}): React.ReactElement {
  return (
    <div className="divide-y divide-border">
      {messages.map((message) => {
        const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
        return (
          <article
            className={cn("px-4 py-5 sm:px-6 sm:py-6", compact && "px-4 py-4 sm:px-4 sm:py-4")}
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
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-foreground/90">
                  {message.textBody || message.snippet}
                </pre>
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
      })}
    </div>
  );
}
