import * as React from "react";

import { getMessage, runMessageAction } from "@/features/messages/api";
import { MessageDetail } from "@/features/messages/message-detail";
import { MessageList } from "@/features/messages/message-list";
import type { MessageDetail as MessageDetailType, MessageSummary } from "@/features/messages/types";

type InboxPageProps = {
  messages: MessageSummary[];
  selectedId: string | null;
  onRefresh: () => void;
  onReply: (message: MessageDetailType) => void;
  onSelect: (messageId: string) => void;
};

export function InboxPage({
  messages,
  selectedId,
  onRefresh,
  onReply,
  onSelect
}: InboxPageProps): React.ReactElement {
  const [detail, setDetail] = React.useState<MessageDetailType | null>(null);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void getMessage(selectedId).then(setDetail);
  }, [selectedId]);

  async function handleAction(action: Parameters<typeof runMessageAction>[1]) {
    if (!selectedId) return;
    await runMessageAction(selectedId, action);
    onRefresh();
    setDetail(await getMessage(selectedId));
  }

  return (
    <div className="grid h-full grid-cols-1 grid-rows-[minmax(210px,40%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-1">
      <section className="flex min-h-0 flex-col border-b bg-card/35 lg:border-b-0 lg:border-r">
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <h1 className="text-sm font-medium">Messages</h1>
          <span className="font-mono text-[11px] text-muted-foreground">{messages.length}</span>
        </div>
        <MessageList
          messages={messages}
          selectedId={selectedId}
          onSelect={(message) => onSelect(message.id)}
        />
      </section>
      <section className="min-h-0 bg-background">
        <MessageDetail
          message={detail}
          onAction={(action) => void handleAction(action)}
          onReply={onReply}
        />
      </section>
    </div>
  );
}
