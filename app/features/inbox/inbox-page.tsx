import * as React from "react";
import { usePanelRef } from "react-resizable-panels";

import {
  conversationListWidthStorageKey,
  defaultConversationListWidth,
  maximumConversationListWidth,
  minimumConversationListWidth,
  minimumConversationReaderWidth,
  readStoredWidth,
  storeLayoutValue
} from "@/components/layout/desktop-layout";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { Mailbox } from "@/features/mailboxes/types";
import { getMessageThread, runConversationAction } from "@/features/messages/api";
import { MessageDetail } from "@/features/messages/message-detail";
import { MessageList } from "@/features/messages/message-list";
import type {
  ConversationAction,
  ConversationSummary,
  MessageDetail as MessageDetailType
} from "@/features/messages/types";
import { useDesktopShell } from "@/hooks/use-desktop-shell";
import { cn } from "@/lib/cn";
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
  const desktopShell = useDesktopShell();
  const conversationListPanelRef = usePanelRef();
  const [initialConversationListWidth] = React.useState(() =>
    readStoredWidth(
      conversationListWidthStorageKey,
      defaultConversationListWidth,
      minimumConversationListWidth,
      maximumConversationListWidth
    )
  );
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

  async function handleAction(action: Parameters<typeof runConversationAction>[1]) {
    if (!selectedId) return;
    const updated = await runConversationAction(selectedId, action, activeFolder);
    onConversationAction(updated.threadId, action, updated.affected);
    void Promise.resolve(onRefresh()).catch(() => undefined);
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

  const listSection = (
    <section
      className={cn(
        "h-full min-h-0 flex-col bg-card/35",
        desktopShell || !selectedId ? "flex" : "hidden"
      )}
      data-mobile-scroll-active={!desktopShell && !selectedId ? "true" : undefined}
      data-mobile-view="message-list"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h1 className="text-sm font-medium">
          <span className="md:hidden">{activeLabel}</span>
          <span className="hidden md:inline">Conversations</span>
        </h1>
        {conversationCountLabel ? (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {conversationCountLabel}
          </span>
        ) : null}
      </div>
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
      />
    </section>
  );
  const readerSection = (
    <section
      className={cn(
        "h-full min-h-0 bg-background",
        desktopShell || selectedId ? "block" : "hidden"
      )}
      data-mobile-scroll-active={!desktopShell && selectedId ? "true" : undefined}
      data-mobile-view="conversation"
    >
      <MessageDetail
        defaultFromMailboxId={defaultFromMailboxId}
        error={detailError}
        isLoading={detailLoading}
        key={selectedId ?? "empty"}
        mailboxes={mailboxes}
        messages={thread}
        selectedId={readerSelectedId}
        showBack={!desktopShell}
        onAction={(action) => void handleAction(action)}
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
    </section>
  );

  if (!desktopShell) {
    return (
      <div className="h-full overflow-hidden">
        {listSection}
        {readerSection}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      id="hqbase-conversation-workspace"
      onLayoutChanged={() => {
        const size = conversationListPanelRef.current?.getSize();
        if (size) {
          storeLayoutValue(conversationListWidthStorageKey, Math.round(size.inPixels));
        }
      }}
      orientation="horizontal"
    >
      <ResizablePanel
        defaultSize={initialConversationListWidth}
        groupResizeBehavior="preserve-pixel-size"
        id="conversation-list"
        maxSize={maximumConversationListWidth}
        minSize={minimumConversationListWidth}
        panelRef={conversationListPanelRef}
      >
        {listSection}
      </ResizablePanel>
      <ResizableHandle aria-label="Resize conversation list" id="conversation-list-divider" />
      <ResizablePanel id="conversation-reader" minSize={minimumConversationReaderWidth}>
        {readerSection}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
