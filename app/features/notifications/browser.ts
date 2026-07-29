import type { SerializedPushSubscription } from "./api";
import type { UnreadCounts } from "./types";

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (count?: number) => Promise<void>;
};

export function supportsPushNotifications(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!supportsPushNotifications()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked in your browser or system settings."
        : "Notification permission was not granted."
    );
  }
  const registration = await navigator.serviceWorker.ready;
  return (
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      applicationServerKey: base64UrlToBytes(publicKey),
      userVisibleOnly: true
    }))
  );
}

export function serializePushSubscription(
  subscription: PushSubscription
): SerializedPushSubscription {
  const serialized = subscription.toJSON();
  const auth = serialized.keys?.auth;
  const p256dh = serialized.keys?.p256dh;
  if (!serialized.endpoint || !auth || !p256dh) {
    throw new Error("The browser returned an incomplete push subscription.");
  }
  return {
    endpoint: serialized.endpoint,
    expirationTime: serialized.expirationTime ?? null,
    keys: { auth, p256dh }
  };
}

export async function applyUnreadIndicators(unread: UnreadCounts): Promise<void> {
  document.title = unread.total > 0 ? `(${unread.total}) HQBase` : "HQBase";
  const badgeNavigator = navigator as BadgeNavigator;
  try {
    if (unread.total > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(unread.total);
    } else if (unread.total === 0 && badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge();
    }
  } catch {
    // In-app counts remain authoritative when the platform declines app badging.
  }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return supportsPushNotifications() ? Notification.permission : "unsupported";
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(`${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
