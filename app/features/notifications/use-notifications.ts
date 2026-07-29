import * as React from "react";

import {
  deleteNotificationSubscription,
  getNotificationStatus,
  saveNotificationSubscription
} from "./api";
import {
  applyUnreadIndicators,
  currentPushSubscription,
  notificationPermission,
  serializePushSubscription,
  subscribeToPush,
  supportsPushNotifications
} from "./browser";
import type {
  NotificationController,
  NotificationDeviceState,
  NotificationStatus,
  UnreadCounts
} from "./types";

const emptyUnread: UnreadCounts = { catchall: 0, inbox: 0, total: 0 };
const refreshIntervalMs = 10_000;

export function useNotifications(
  userId: string | null,
  onForegroundPush: () => void
): NotificationController {
  const [status, setStatus] = React.useState<NotificationStatus>({
    unread: emptyUnread,
    vapidPublicKey: null
  });
  const [deviceState, setDeviceState] = React.useState<NotificationDeviceState>("checking");
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reconciledEndpoint = React.useRef<string | null>(null);
  const onForegroundPushRef = React.useRef(onForegroundPush);
  React.useEffect(() => {
    onForegroundPushRef.current = onForegroundPush;
  }, [onForegroundPush]);

  const refresh = React.useCallback(async () => {
    if (!userId) {
      setStatus({ unread: emptyUnread, vapidPublicKey: null });
      setDeviceState("checking");
      await applyUnreadIndicators(emptyUnread);
      return;
    }
    const nextStatus = await getNotificationStatus();
    setStatus(nextStatus);
    await applyUnreadIndicators(nextStatus.unread);
    await reconcileDevice(nextStatus, reconciledEndpoint, setDeviceState);
  }, [userId]);

  React.useEffect(() => {
    if (!userId) {
      void applyUnreadIndicators(emptyUnread);
      return;
    }
    let active = true;
    const runRefresh = async () => {
      try {
        await refresh();
        if (active) setError(null);
      } catch {
        // A later focus, foreground push, or interval retries without interrupting mail.
      }
    };
    const handleFocus = () => void runRefresh();
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "hqbase:push-received") return;
      onForegroundPushRef.current();
      void runRefresh();
    };

    void runRefresh();
    window.addEventListener("focus", handleFocus);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    const interval = window.setInterval(runRefresh, refreshIntervalMs);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [refresh, userId]);

  const enable = React.useCallback(async () => {
    setIsBusy(true);
    setError(null);
    let nextStatus = status;
    try {
      nextStatus = status.vapidPublicKey ? status : await getNotificationStatus();
      setStatus(nextStatus);
      if (!nextStatus.vapidPublicKey) {
        throw new Error("Push notifications are not configured for this HQBase installation.");
      }
      const subscription = await subscribeToPush(nextStatus.vapidPublicKey);
      const serialized = serializePushSubscription(subscription);
      await saveNotificationSubscription(serialized);
      reconciledEndpoint.current = serialized.endpoint;
      setStatus(nextStatus);
      setDeviceState("enabled");
      await applyUnreadIndicators(nextStatus.unread);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Notifications could not be enabled."
      );
      setDeviceState(deviceStateFromBrowser(nextStatus.vapidPublicKey));
    } finally {
      setIsBusy(false);
    }
  }, [status]);

  const disable = React.useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const subscription = await currentPushSubscription();
      if (subscription) {
        try {
          await deleteNotificationSubscription(subscription.endpoint);
        } finally {
          // Local unsubscribe is the privacy boundary. A stale server row is
          // harmless and is pruned when its push endpoint returns 404/410.
          await subscription.unsubscribe();
        }
      }
      reconciledEndpoint.current = null;
      setDeviceState(deviceStateFromBrowser(status.vapidPublicKey));
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Notifications could not be disabled."
      );
    } finally {
      setIsBusy(false);
    }
  }, [status.vapidPublicKey]);

  return {
    deviceState,
    disable,
    enable,
    error,
    isBusy,
    refresh,
    unread: status.unread
  };
}

async function reconcileDevice(
  status: NotificationStatus,
  reconciledEndpoint: React.MutableRefObject<string | null>,
  setDeviceState: React.Dispatch<React.SetStateAction<NotificationDeviceState>>
): Promise<void> {
  const initialState = deviceStateFromBrowser(status.vapidPublicKey);
  if (initialState !== "available") {
    setDeviceState(initialState);
    return;
  }
  const subscription = await currentPushSubscription();
  if (!subscription) {
    reconciledEndpoint.current = null;
    setDeviceState("available");
    return;
  }
  if (reconciledEndpoint.current !== subscription.endpoint) {
    await saveNotificationSubscription(serializePushSubscription(subscription));
    reconciledEndpoint.current = subscription.endpoint;
  }
  setDeviceState("enabled");
}

function deviceStateFromBrowser(publicKey: string | null): NotificationDeviceState {
  if (!supportsPushNotifications()) return "unsupported";
  if (!publicKey) return "unconfigured";
  const permission = notificationPermission();
  if (permission === "denied") return "blocked";
  return "available";
}
