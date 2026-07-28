import type * as React from "react";

import { appRoutePath, type MailFolderId } from "@/lib/routes";
import { EmptyMessageList, MessageListItem } from "./message-list-item";
import type { ConversationSummary } from "./types";

type MessageListProps = {
  activeFolder: MailFolderId;
  conversations: ConversationSummary[];
  selectedThreadId: string | null;
  onSelect: (conversation: ConversationSummary) => void;
};

export function MessageList({
  activeFolder,
  conversations,
  selectedThreadId,
  onSelect
}: MessageListProps): React.ReactElement {
  if (conversations.length === 0) {
    return <EmptyMessageList />;
  }

  return (
    <div className="h-full overflow-auto">
      {conversations.map((conversation) => (
        <MessageListItem
          activeFolder={activeFolder}
          conversation={conversation}
          href={appRoutePath({ kind: "mail", folder: activeFolder, messageId: conversation.id })}
          isActive={conversation.threadId === selectedThreadId}
          key={conversation.threadId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
