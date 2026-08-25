import * as React from "react";
import { PiCircleNotch } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import type { MailLabel } from "@/features/labels/types";
import { appRoutePath, type MailFolderId } from "@/lib/routes";
import { groupConversations } from "./conversation-display";
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
  onToggleStar: (conversation: ConversationSummary) => void;
  labels?: MailLabel[];
  canOrganizeConversation?: (mailboxId: string | null) => boolean;
  onToggleLabel?: (
    conversation: ConversationSummary,
    label: MailLabel,
    assigned: boolean
  ) => Promise<void> | void;
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
  onSelect,
  onToggleStar,
  labels = [],
  canOrganizeConversation = () => false,
  onToggleLabel = () => undefined
}: MessageListProps): React.ReactElement {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const pagingTriggerRef = React.useRef<HTMLDivElement>(null);
  const groups = groupConversations(conversations);

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
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <EmptyMessageList />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1200px] px-1 pb-5 sm:px-6 lg:px-8">
          {groups.map((group) => (
            <section
              aria-labelledby={`conversation-group-${group.key}`}
              className="[&:not(:first-child)]:pt-1"
              key={group.key}
            >
              <h2
                className="px-3 pb-1.5 pt-6 text-[13px] font-medium text-foreground sm:px-0"
                id={`conversation-group-${group.key}`}
              >
                {group.label}
              </h2>
              <div className="flex flex-col gap-0.5">
                {group.conversations.map((conversation) => (
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
                    labels={labels}
                    canOrganizeLabels={canOrganizeConversation(conversation.mailboxId)}
                    onSelect={onSelect}
                    onToggleLabel={(label, assigned) =>
                      onToggleLabel(conversation, label, assigned)
                    }
                    onToggleStar={onToggleStar}
                  />
                ))}
              </div>
            </section>
          ))}
          {hasMore || isLoadingMore || loadMoreError ? (
            <div
              className="mt-4 flex min-h-16 items-center justify-center px-4 py-3"
              ref={pagingTriggerRef}
            >
              <div aria-live="polite" className="flex min-h-11 items-center justify-center">
                {isLoadingMore ? (
                  <span
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    <PiCircleNotch aria-hidden="true" className="size-4 animate-spin" />
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
        </div>
      )}
    </PullToRefresh>
  );
}
