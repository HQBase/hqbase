import { LoaderCircle } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { appRoutePath, type MailFolderId } from "@/lib/routes";
import { EmptyMessageList, MessageListItem } from "./message-list-item";
import type { ConversationSummary } from "./types";

type MessageListProps = {
  activeFolder: MailFolderId;
  conversations: ConversationSummary[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  selectedThreadId: string | null;
  onLoadMore: () => void;
  onRefresh: () => Promise<void> | void;
  onSelect: (conversation: ConversationSummary) => void;
};

export function MessageList({
  activeFolder,
  conversations,
  hasMore,
  isLoadingMore,
  loadMoreError,
  selectedThreadId,
  onLoadMore,
  onRefresh,
  onSelect
}: MessageListProps): React.ReactElement {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const pagingTriggerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!hasMore || isLoadingMore || loadMoreError || typeof IntersectionObserver === "undefined") {
      return;
    }
    const trigger = pagingTriggerRef.current;
    if (!trigger) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore();
      },
      { root: scrollContainerRef.current, rootMargin: "240px 0px" }
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMoreError, onLoadMore]);

  return (
    <PullToRefresh className="h-full" onRefresh={onRefresh} scrollContainerRef={scrollContainerRef}>
      {conversations.length === 0 ? (
        <EmptyMessageList />
      ) : (
        <>
          {conversations.map((conversation) => (
            <MessageListItem
              activeFolder={activeFolder}
              conversation={conversation}
              href={appRoutePath({
                kind: "mail",
                folder: activeFolder,
                messageId: conversation.id
              })}
              isActive={conversation.threadId === selectedThreadId}
              key={conversation.threadId}
              onSelect={onSelect}
            />
          ))}
          {hasMore || isLoadingMore || loadMoreError ? (
            <div
              className="flex min-h-16 items-center justify-center border-t border-border/60 px-4 py-3"
              ref={pagingTriggerRef}
            >
              <div aria-live="polite" className="flex min-h-11 items-center justify-center">
                {isLoadingMore ? (
                  <span
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    Loading more conversations…
                  </span>
                ) : loadMoreError ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs text-muted-foreground">{loadMoreError}</span>
                    <Button
                      className="min-h-11"
                      onClick={onLoadMore}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Retry loading conversations
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="min-h-11"
                    onClick={onLoadMore}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Load more conversations
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </PullToRefresh>
  );
}
