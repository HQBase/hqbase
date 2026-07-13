import type * as React from "react";

import { EmptyMessageList, MessageListItem } from "./message-list-item";
import type { MessageSummary } from "./types";

type MessageListProps = {
  messages: MessageSummary[];
  selectedId: string | null;
  onSelect: (message: MessageSummary) => void;
};

export function MessageList({
  messages,
  selectedId,
  onSelect
}: MessageListProps): React.ReactElement {
  if (messages.length === 0) {
    return <EmptyMessageList />;
  }

  return (
    <div className="h-full overflow-auto">
      {messages.map((message) => (
        <MessageListItem
          isActive={message.id === selectedId}
          key={message.id}
          message={message}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
