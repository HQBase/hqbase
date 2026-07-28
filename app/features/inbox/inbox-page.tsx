import * as React from "react";

import type { Mailbox } from "@/features/mailboxes/types";
import { getMessageThread, runMessageAction } from "@/features/messages/api";
import { MessageDetail } from "@/features/messages/message-detail";
import { MessageList } from "@/features/messages/message-list";
import type { MessageDetail as MessageDetailType, MessageSummary } from "@/features/messages/types";
import { cn } from "@/lib/cn";
import type { MailFolderId } from "@/lib/routes";

type InboxPageProps = {
  activeFolder: MailFolderId;
  mailboxes: Mailbox[];
  messages: MessageSummary[];
  selectedId: string | null;
  onRefresh: () => void;
  onMessageRouteChange: (folder: MailFolderId, messageId: string | null) => void;
  onSelect: (messageId: string) => void;
};

export function InboxPage({
  activeFolder,
  mailboxes,
  messages,
  selectedId,
  onRefresh,
  onMessageRouteChange,
  onSelect
}: InboxPageProps): React.ReactElement {
  const [thread, setThread] = React.useState<MessageDetailType[]>([]);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const loadThread = React.useCallback(async (messageId: string) => {
    const messages = await getMessageThread(messageId);
    setThread(messages);
  }, []);

  React.useEffect(() => {
    if (!selectedId) {
      setThread([]);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setThread([]);
    setDetailError(null);
    setDetailLoading(true);
    void getMessageThread(selectedId)
      .then((messages) => {
        if (!cancelled) setThread(messages);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : "Message could not be opened.");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleAction(action: Parameters<typeof runMessageAction>[1]) {
    if (!selectedId) return;
    const updated = await runMessageAction(selectedId, action);
    onRefresh();
    await loadThread(selectedId);
    if (
      action === "archive" ||
      action === "trash" ||
      (activeFolder === "starred" && action === "unstar")
    ) {
      onMessageRouteChange(updated.folder, updated.id);
    }
  }

  return (
    <div className="h-full overflow-hidden lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
      <section
        className={cn(
          "h-full min-h-0 flex-col bg-card/35 lg:flex lg:border-r",
          selectedId ? "hidden" : "flex"
        )}
        data-mobile-view="message-list"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <h1 className="text-sm font-medium">Messages</h1>
          <span className="font-mono text-[11px] text-muted-foreground">{messages.length}</span>
        </div>
        <MessageList
          activeFolder={activeFolder}
          messages={messages}
          selectedId={selectedId}
          onSelect={(message) => onSelect(message.id)}
        />
      </section>
      <section
        className={cn("h-full min-h-0 bg-background lg:block", selectedId ? "block" : "hidden")}
        data-mobile-view="conversation"
      >
        <MessageDetail
          error={detailError}
          isLoading={detailLoading}
          key={selectedId ?? "empty"}
          mailboxes={mailboxes}
          messages={thread}
          selectedId={selectedId}
          onAction={(action) => void handleAction(action)}
          onBack={() => onMessageRouteChange(activeFolder, null)}
          onSent={() => {
            onRefresh();
            if (selectedId) void loadThread(selectedId);
          }}
        />
      </section>
    </div>
  );
}
