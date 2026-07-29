import * as React from "react";

import type { Mailbox } from "@/features/mailboxes/types";
import { getMessageThread, runConversationAction } from "@/features/messages/api";
import { MessageDetail } from "@/features/messages/message-detail";
import { MessageList } from "@/features/messages/message-list";
import type {
  ConversationSummary,
  MessageDetail as MessageDetailType
} from "@/features/messages/types";
import { cn } from "@/lib/cn";
import type { MailFolderId } from "@/lib/routes";
import { mailFolders } from "@/lib/routes";

type InboxPageProps = {
  activeFolder: MailFolderId;
  conversations: ConversationSummary[];
  mailboxes: Mailbox[];
  selectedId: string | null;
  onRefresh: () => void;
  onUnreadChange: () => void;
  onMessageRouteChange: (folder: MailFolderId, messageId: string | null) => void;
  onSelect: (messageId: string) => void;
};

export function InboxPage({
  activeFolder,
  conversations,
  mailboxes,
  selectedId,
  onRefresh,
  onUnreadChange,
  onMessageRouteChange,
  onSelect
}: InboxPageProps): React.ReactElement {
  const activeLabel = mailFolders.find((folder) => folder.id === activeFolder)?.label ?? "Messages";
  const [thread, setThread] = React.useState<MessageDetailType[]>([]);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const onRefreshRef = React.useRef(onRefresh);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

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
        if (cancelled) return;
        setThread(messages);
        if (
          messages.some((message) => message.direction === "inbound" && message.readAt === null)
        ) {
          void runConversationAction(selectedId, "read", activeFolder)
            .then((updated) => {
              if (cancelled) return;
              if (updated.affected > 0) {
                setThread((current) =>
                  current.map((message) =>
                    message.direction === "inbound"
                      ? { ...message, readAt: new Date().toISOString() }
                      : message
                  )
                );
              }
              onRefreshRef.current();
              onUnreadChange();
            })
            .catch(() => undefined);
        }
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
  }, [activeFolder, onUnreadChange, selectedId]);

  const selectedThreadId =
    thread[0]?.threadId ??
    conversations.find((conversation) => conversation.id === selectedId)?.threadId ??
    null;
  const selectedConversation = conversations.find(
    (conversation) => conversation.threadId === selectedThreadId
  );
  const readerSelectedId = selectedConversation?.id ?? selectedId;

  React.useEffect(() => {
    if (
      !selectedId ||
      !selectedConversation ||
      thread.some((message) => message.id === selectedConversation.id)
    ) {
      return;
    }
    void loadThread(selectedConversation.id);
  }, [loadThread, selectedConversation, selectedId, thread]);

  async function handleAction(action: Parameters<typeof runConversationAction>[1]) {
    if (!selectedId) return;
    await runConversationAction(selectedId, action, activeFolder);
    onRefresh();
    onUnreadChange();
    if (
      action === "archive" ||
      action === "trash" ||
      (activeFolder === "starred" && action === "unstar")
    ) {
      onMessageRouteChange(activeFolder, null);
      return;
    }
    await loadThread(selectedId);
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
          <h1 className="text-sm font-medium">
            <span className="md:hidden">{activeLabel}</span>
            <span className="hidden md:inline">Conversations</span>
          </h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            {conversations.length}
          </span>
        </div>
        <MessageList
          activeFolder={activeFolder}
          conversations={conversations}
          selectedThreadId={selectedThreadId}
          onSelect={(conversation) => onSelect(conversation.id)}
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
          selectedId={readerSelectedId}
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
