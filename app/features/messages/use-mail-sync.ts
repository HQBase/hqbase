import * as React from "react";
import { toast } from "sonner";

import type { MailLabel } from "@/features/labels/types";
import { useNotifications } from "@/features/notifications/use-notifications";
import { playNotificationSound } from "@/lib/notification-sounds";
import type { FolderId } from "@/lib/routes";

import { listConversations } from "./api";
import type { ConversationAction, ConversationSummary } from "./types";

const noLabelIds: readonly string[] = [];

type MailSyncOptions = {
  activeFolder: FolderId;
  labelIds?: readonly string[];
  mailboxId: string;
  search: string;
  userId: string | null;
};

export function useMailSync({
  activeFolder,
  labelIds = noLabelIds,
  mailboxId,
  search,
  userId
}: MailSyncOptions): {
  applyConversationAction: (threadId: string, action: ConversationAction, affected: number) => void;
  applyConversationLabels: (threadId: string, labels: MailLabel[]) => void;
  conversations: ConversationSummary[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  loadMoreError: string | null;
  notifications: ReturnType<typeof useNotifications>;
  hardRefresh: () => Promise<void>;
  refresh: () => Promise<void>;
  totalCount: number | null;
} {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(null);
  const notifications = useNotifications(userId);
  const refreshNotifications = notifications.refresh;
  const latestInboundId = React.useRef<string | null>(null);
  const hasInboundSnapshot = React.useRef(false);
  const currentUserId = React.useRef(userId);
  const syncKey = [userId, activeFolder, mailboxId, labelIds.join(","), search].join("\u0000");
  const currentSyncKey = React.useRef(syncKey);
  const paginationSyncKey = React.useRef<string | null>(null);
  const inboundSnapshotUserId = React.useRef(userId);
  const inFlight = React.useRef<{ key: string; promise: Promise<void> } | null>(null);
  const loadMoreInFlight = React.useRef<{
    cursor: string;
    key: string;
    promise: Promise<void>;
  } | null>(null);
  const loadedAdditionalPages = React.useRef(false);
  const refreshGeneration = React.useRef(0);
  currentUserId.current = userId;
  currentSyncKey.current = syncKey;

  const reset = React.useCallback((preserveVisible = false): void => {
    refreshGeneration.current += 1;
    inFlight.current = null;
    loadMoreInFlight.current = null;
    loadedAdditionalPages.current = false;
    setIsLoadingMore(false);
    setLoadMoreError(null);
    if (preserveVisible) return;
    setConversations([]);
    setNextCursor(null);
    setTotalCount(null);
  }, []);

  const refresh = React.useCallback((): Promise<void> => {
    if (inFlight.current?.key === syncKey) return inFlight.current.promise;

    const generation = refreshGeneration.current;
    const promise = (async () => {
      if (!userId) {
        setConversations([]);
        setNextCursor(null);
        setTotalCount(null);
        await refreshNotifications();
        return;
      }

      const [notificationResult, conversationResult] = await Promise.allSettled([
        refreshNotifications(),
        activeFolder === "settings" ||
        activeFolder === "contacts" ||
        activeFolder === "agents" ||
        activeFolder === "drafts"
          ? Promise.resolve<null>(null)
          : listConversations({
              folder: activeFolder,
              labelIds: labelIds.length === 0 ? undefined : labelIds,
              mailboxId: mailboxId === "all" ? undefined : mailboxId,
              search: search || undefined
            })
      ]);
      if (
        currentSyncKey.current !== syncKey ||
        currentUserId.current !== userId ||
        refreshGeneration.current !== generation
      ) {
        return;
      }

      if (conversationResult.status === "fulfilled" && conversationResult.value !== null) {
        const page = conversationResult.value;
        if (page.totalCount !== null) setTotalCount(page.totalCount);
        if (loadedAdditionalPages.current) {
          setConversations((current) => reconcileNewestPage(page.conversations, current));
        } else {
          setConversations(page.conversations);
          setNextCursor(page.nextCursor);
        }
      }
      if (notificationResult.status === "fulfilled") {
        const nextInboundId = notificationResult.value.latestInboundMessageId;
        if (
          hasInboundSnapshot.current &&
          nextInboundId !== null &&
          nextInboundId !== latestInboundId.current
        ) {
          playNotificationSound("incoming-email");
        }
        latestInboundId.current = nextInboundId;
        hasInboundSnapshot.current = true;
      }

      if (conversationResult.status === "rejected") throw conversationResult.reason;
      if (
        conversationResult.status === "fulfilled" &&
        conversationResult.value === null &&
        notificationResult.status === "rejected"
      ) {
        throw notificationResult.reason;
      }
    })();
    inFlight.current = { key: syncKey, promise };
    const clearInFlight = (): void => {
      if (inFlight.current?.promise === promise) inFlight.current = null;
    };
    void promise.then(clearInFlight, clearInFlight);
    return promise;
  }, [activeFolder, labelIds, mailboxId, refreshNotifications, search, syncKey, userId]);

  const hardRefresh = React.useCallback((): Promise<void> => {
    reset(true);
    return refresh();
  }, [refresh, reset]);

  React.useEffect(() => {
    if (paginationSyncKey.current === syncKey) return;
    paginationSyncKey.current = syncKey;
    reset();
  }, [reset, syncKey]);

  React.useEffect(() => {
    if (inboundSnapshotUserId.current === userId) return;
    inboundSnapshotUserId.current = userId;
    latestInboundId.current = null;
    hasInboundSnapshot.current = false;
  }, [userId]);

  React.useEffect(() => {
    if (!userId) {
      void refresh();
      return;
    }

    let active = true;
    const runRefresh = (reportError = false): void => {
      void refresh().catch((error: unknown) => {
        if (active && reportError) {
          toast.error(error instanceof Error ? error.message : "Mail could not be refreshed.");
        }
      });
    };
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === "visible") runRefresh();
    };
    const handleServiceWorkerMessage = (event: MessageEvent): void => {
      if (event.data?.type === "hqbase:push-received") runRefresh();
    };

    runRefresh(true);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [refresh, userId]);

  const loadMore = React.useCallback((): Promise<void> => {
    if (
      !userId ||
      !nextCursor ||
      activeFolder === "settings" ||
      activeFolder === "contacts" ||
      activeFolder === "agents" ||
      activeFolder === "drafts"
    ) {
      return Promise.resolve();
    }
    if (
      loadMoreInFlight.current?.key === syncKey &&
      loadMoreInFlight.current.cursor === nextCursor
    ) {
      return loadMoreInFlight.current.promise;
    }

    const cursor = nextCursor;
    const generation = refreshGeneration.current;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const promise = (async () => {
      try {
        const page = await listConversations({
          cursor,
          folder: activeFolder,
          labelIds: labelIds.length === 0 ? undefined : labelIds,
          mailboxId: mailboxId === "all" ? undefined : mailboxId,
          search: search || undefined
        });
        if (
          currentSyncKey.current !== syncKey ||
          currentUserId.current !== userId ||
          refreshGeneration.current !== generation
        ) {
          return;
        }
        loadedAdditionalPages.current = true;
        setConversations((current) => appendConversationPage(current, page.conversations));
        setNextCursor(page.nextCursor);
      } catch (error: unknown) {
        if (currentSyncKey.current === syncKey && refreshGeneration.current === generation) {
          setLoadMoreError(
            error instanceof Error ? error.message : "More conversations could not be loaded."
          );
        }
      } finally {
        if (currentSyncKey.current === syncKey && refreshGeneration.current === generation) {
          setIsLoadingMore(false);
        }
      }
    })();
    loadMoreInFlight.current = { cursor, key: syncKey, promise };
    const clearInFlight = (): void => {
      if (loadMoreInFlight.current?.promise === promise) loadMoreInFlight.current = null;
    };
    void promise.then(clearInFlight, clearInFlight);
    return promise;
  }, [activeFolder, labelIds, mailboxId, nextCursor, search, syncKey, userId]);

  const applyConversationAction = React.useCallback(
    (threadId: string, action: ConversationAction, affected: number): void => {
      if (affected === 0) return;
      const removesConversation =
        action === "archive" ||
        action === "unarchive" ||
        action === "trash" ||
        action === "restore" ||
        (activeFolder === "starred" && action === "unstar");
      if (removesConversation) {
        setTotalCount((current) => (current === null ? null : Math.max(0, current - 1)));
      }
      setConversations((current) =>
        current.flatMap((conversation) => {
          if (conversation.threadId !== threadId) return [conversation];
          if (removesConversation) {
            return [];
          }
          if (action === "read") return [{ ...conversation, unreadCount: 0 }];
          if (action === "unread") {
            return [{ ...conversation, unreadCount: Math.max(1, conversation.unreadCount) }];
          }
          if (action === "star") {
            return [{ ...conversation, isStarred: true, starredAt: new Date().toISOString() }];
          }
          if (action === "unstar") {
            return [{ ...conversation, isStarred: false, starredAt: null }];
          }
          return [conversation];
        })
      );
    },
    [activeFolder]
  );

  const applyConversationLabels = React.useCallback(
    (threadId: string, labels: MailLabel[]): void => {
      const remainsInView = labelIds.every((id) => labels.some((label) => label.id === id));
      if (!remainsInView) {
        setTotalCount((current) => (current === null ? null : Math.max(0, current - 1)));
      }
      setConversations((current) =>
        current.flatMap((conversation) => {
          if (conversation.threadId !== threadId) return [conversation];
          return remainsInView ? [{ ...conversation, labels }] : [];
        })
      );
    },
    [labelIds]
  );

  return {
    applyConversationAction,
    applyConversationLabels,
    conversations,
    hasMore: nextCursor !== null,
    isLoadingMore,
    loadMore,
    loadMoreError,
    notifications,
    hardRefresh,
    refresh,
    totalCount
  };
}

function reconcileNewestPage(
  newest: ConversationSummary[],
  current: ConversationSummary[]
): ConversationSummary[] {
  const newestThreadIds = new Set(newest.map((conversation) => conversation.threadId));
  return [
    ...newest,
    ...current.filter((conversation) => !newestThreadIds.has(conversation.threadId))
  ];
}

function appendConversationPage(
  current: ConversationSummary[],
  next: ConversationSummary[]
): ConversationSummary[] {
  const currentThreadIds = new Set(current.map((conversation) => conversation.threadId));
  return [
    ...current,
    ...next.filter((conversation) => !currentThreadIds.has(conversation.threadId))
  ];
}
