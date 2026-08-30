import * as React from "react";

import {
  MessageHtml,
  PlainTextMessage,
  QuotedContentDivider
} from "@/features/messages/message-html";
import type { MessageDetail } from "@/features/messages/types";
import { formatDateTime } from "@/lib/format";

export function ReplyQuotePreview({
  messages,
  target
}: {
  messages: MessageDetail[];
  target: MessageDetail;
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  const targetIndex = messages.findIndex((message) => message.id === target.id);
  const chain = (targetIndex < 0 ? [target] : messages.slice(0, targetIndex + 1)).reverse();
  const oldestId = chain.at(-1)?.id;

  return (
    <div className="border-t px-5 py-2" data-reply-quote-preview>
      <QuotedContentDivider expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
      {expanded ? (
        <div
          className="mt-3 border-l border-border pl-3 text-muted-foreground"
          data-reply-quote-content
        >
          {chain.map((message, index) => (
            <section
              className={index === 0 ? undefined : "mt-4 border-t border-border/60 pt-4"}
              data-reply-quote-message-id={message.id}
              key={message.id}
            >
              <div className="mb-2 text-xs text-muted-foreground">
                {message.fromName ?? message.fromAddress} ·{" "}
                {formatDateTime(message.receivedAt ?? message.sentAt ?? message.createdAt)}
              </div>
              {message.htmlAvailable ? (
                <MessageHtml
                  message={message}
                  quoteMode={message.id === oldestId ? "expanded" : "hidden"}
                />
              ) : (
                <PlainTextMessage
                  message={message}
                  quoteMode={message.id === oldestId ? "expanded" : "hidden"}
                />
              )}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
