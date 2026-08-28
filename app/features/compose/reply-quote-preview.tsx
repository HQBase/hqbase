import * as React from "react";

import {
  MessageHtml,
  PlainTextMessage,
  QuotedContentDivider
} from "@/features/messages/message-html";
import type { MessageDetail } from "@/features/messages/types";

export function ReplyQuotePreview({ message }: { message: MessageDetail }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border-t px-5 py-2" data-reply-quote-preview>
      <QuotedContentDivider expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
      {expanded ? (
        <div className="mt-3 text-muted-foreground" data-reply-quote-content>
          {message.htmlAvailable ? (
            <MessageHtml message={message} />
          ) : (
            <PlainTextMessage message={message} />
          )}
        </div>
      ) : null}
    </div>
  );
}
