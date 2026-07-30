import * as React from "react";
import { toast } from "sonner";

import { useNotifications } from "@/features/notifications/use-notifications";
import { playNotificationSound } from "@/lib/notification-sounds";
import type { FolderId } from "@/lib/routes";

import { listConversations } from "./api";
import type { ConversationSummary } from "./types";

const refreshIntervalMs = 10_000;

type MailSyncOptions = {
  activeFolder: FolderId;
  mailboxId: string;
  search: string;
  userId: string | null;
};

export function useMailSync({ activeFolder, mailboxId, search, userId }: MailSyncOptions): {
  conversations: ConversationSummary[];
  notifications: ReturnType<typeof useNotifications>;
  refresh: () => Promise<void>;
} {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const notifications = useNotifications(userId);
  const refreshNotifications = notifications.refresh;
  const latestInboundId = React.useRef<string | null>(null);
  const hasInboundSnapshot = React.useRef(false);
  const currentUserId = React.useRef(userId);
  const syncKey = [userId, activeFolder, mailboxId, search].join("\u0000");
  const currentSyncKey = React.useRef(syncKey);
  const inFlight = React.useRef<{ key: string; promise: Promise<void> } | null>(null);
  currentUserId.current = userId;
  currentSyncKey.current = syncKey;

  const refresh = React.useCallback((): Promise<void> => {
    if (inFlight.current?.key === syncKey) return inFlight.current.promise;

    const promise = (async () => {
      if (!userId) {
        setConversations([]);
        await refreshNotifications();
        return;
      }

      const [notificationResult, conversationResult] = await Promise.allSettled([
        refreshNotifications(),
        activeFolder === "settings" || activeFolder === "drafts"
          ? Promise.resolve<ConversationSummary[] | null>(null)
          : listConversations({
              folder: activeFolder,
              mailboxId: mailboxId === "all" ? undefined : mailboxId,
              search: search || undefined
            })
      ]);
      if (currentSyncKey.current !== syncKey || currentUserId.current !== userId) return;

      if (conversationResult.status === "fulfilled" && conversationResult.value !== null) {
        setConversations(conversationResult.value);
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
    })();
    inFlight.current = { key: syncKey, promise };
    const clearInFlight = (): void => {
      if (inFlight.current?.promise === promise) inFlight.current = null;
    };
    void promise.then(clearInFlight, clearInFlight);
    return promise;
  }, [activeFolder, mailboxId, refreshNotifications, search, syncKey, userId]);

  React.useEffect(() => {
    latestInboundId.current = null;
    hasInboundSnapshot.current = false;
    if (!userId) setConversations([]);
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
    const interval = window.setInterval(runRefresh, refreshIntervalMs);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [refresh, userId]);

  return { conversations, notifications, refresh };
}
