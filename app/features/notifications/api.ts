import { apiDelete, apiGet, apiPut } from "@/lib/api-client";
import type { NotificationStatus } from "./types";

export type SerializedPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

export function getNotificationStatus(): Promise<NotificationStatus> {
  return apiGet<NotificationStatus>("/api/notifications/status");
}

export async function saveNotificationSubscription(
  subscription: SerializedPushSubscription
): Promise<void> {
  await apiPut("/api/notifications/subscription", subscription);
}

export async function deleteNotificationSubscription(endpoint: string): Promise<void> {
  await apiDelete("/api/notifications/subscription", { endpoint });
}
