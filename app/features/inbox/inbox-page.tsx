import * as React from "react";
import { PiArrowLeft } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import type { Mailbox } from "@/features/mailboxes/types";
import { getMessageThread, runConversationAction } from "@/features/messages/api";
import { MessageDetail } from "@/features/messages/message-detail";
import { MessageList } from "@/features/messages/message-list";
import type {
  ConversationAction,
  ConversationSummary,
  MessageDetail as MessageDetailType
} from "@/features/messages/types";
import type { MailFolderId } from "@/lib/routes";
import { mailFolders } from "@/lib/routes";

type InboxPageProps = {
  activeFolder: MailFolderId;
  conversations: ConversationSummary[];
  defaultFromMailboxId: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  mailboxes: Mailbox[];
  selectedId: string | null;
  onDraftsChange?: () => void;
  onConversationAction: (threadId: string, action: ConversationAction, affected: number) => void;
  onLoadMore: () => void;
  onRefresh: () => Promise<void> | void;
  onMessageRouteChange: (folder: MailFolderId, messageId: string | null) => void;
  onSelect: (messageId: string) => void;
  totalCount: number | null;
};

export function InboxPage({
  activeFolder,
  conversations,
  defaultFromMailboxId,
  hasMore,
  isLoadingMore,
  loadMoreError,
  mailboxes,
  selectedId,
  onDraftsChange,
  onConversationAction,
  onLoadMore,
  onRefresh,
  onMessageRouteChange,
  onSelect,
  totalCount
}: InboxPageProps): React.ReactElement {
  const activeLabel = mailFolders.find((folder) => folder.id === activeFolder)?.label ?? "Messages";
  const conversationCountLabel =
    totalCount === null
      ? null
      : `${totalCount.toLocaleString()} ${totalCount === 1 ? "conversation" : "conversations"}`;
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
              onConversationAction(updated.threadId, "read", updated.affected);
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
  }, [activeFolder, onConversationAction, selectedId]);

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

  const handleStarToggle = React.useCallback(
    async (conversation: ConversationSummary) => {
      const action = conversation.isStarred ? "unstar" : "star";
      try {
        const updated = await runConversationAction(conversation.id, action, activeFolder);
        onConversationAction(updated.threadId, action, updated.affected);
        void Promise.resolve(onRefresh()).catch(() => undefined);
      } catch {
        // keep row state unchanged on failure; refresh will reconcile
      }
    },
    [activeFolder, onConversationAction, onRefresh]
  );

  async function handleAction(action: Parameters<typeof runConversationAction>[1]) {
    if (!selectedId) return;
    const updated = await runConversationAction(selectedId, action, activeFolder);
    onConversationAction(updated.threadId, action, updated.affected);
    void Promise.resolve(onRefresh()).catch(() => undefined);
    if (
      action === "archive" ||
      action === "unarchive" ||
      action === "trash" ||
      action === "restore" ||
      (activeFolder === "starred" && action === "unstar")
    ) {
      onMessageRouteChange(activeFolder, null);
      return;
    }
    await loadThread(selectedId);
  }

  if (selectedId) {
    return (
      <div className="flex h-full flex-col bg-reader">
        {(detailLoading || thread.length === 0) && !detailError ? (
          <div className="flex h-full flex-col">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-divider bg-toolbar px-3">
              <Button
                aria-label="Back to messages"
                className="size-10 min-h-10 min-w-10 shrink-0 text-tertiary"
                onClick={() => onMessageRouteChange(activeFolder, null)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <PiArrowLeft aria-hidden="true" className="pointer-events-none" />
              </Button>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="pointer-events-none size-4 rounded-full border-2 border-muted-foreground/20 border-t-foreground animate-spin"
                  aria-hidden="true"
                />
                Loading conversation…
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center p-8">
              <span
                className="pointer-events-none size-5 rounded-full border-2 border-muted-foreground/20 border-t-foreground animate-spin"
                aria-hidden="true"
              />
            </div>
          </div>
        ) : (
          <MessageDetail
            activeFolder={activeFolder}
            defaultFromMailboxId={defaultFromMailboxId}
            error={detailError}
            isLoading={detailLoading}
            key={selectedId}
            mailboxes={mailboxes}
            messages={thread}
            selectedId={readerSelectedId}
            showBack
            onAction={handleAction}
            onBack={() => onMessageRouteChange(activeFolder, null)}
            {...(onDraftsChange ? { onDraftsChange } : {})}
            onRefresh={async () => {
              await onRefresh();
              if (selectedId) await loadThread(selectedId);
            }}
            onSent={() => {
              void Promise.resolve(onRefresh()).catch(() => undefined);
              if (selectedId) void loadThread(selectedId);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-list" data-mobile-view="message-list">
      <div className="flex h-11 shrink-0 items-center border-b border-divider bg-toolbar">
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <span className="text-sm font-medium text-foreground">{activeLabel}</span>
          {conversationCountLabel ? (
            <span className="text-[12px] tabular-nums text-tertiary">{conversationCountLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MessageList
          activeFolder={activeFolder}
          conversations={conversations}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreError={loadMoreError}
          selectedThreadId={selectedThreadId}
          onLoadMore={onLoadMore}
          onRefresh={onRefresh}
          onSelect={(conversation) => onSelect(conversation.id)}
          onToggleStar={handleStarToggle}
        />
      </div>
    </div>
  );
}
