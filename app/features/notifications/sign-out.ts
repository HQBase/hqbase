import { deleteNotificationSubscription } from "./api";
import { currentPushSubscription } from "./browser";

export async function disableCurrentDeviceNotificationsBeforeSignOut(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try {
    await deleteNotificationSubscription(subscription.endpoint);
  } finally {
    // Stop this browser from receiving mail even when the server cleanup must
    // be retried through the push service's normal 404/410 pruning.
    await subscription.unsubscribe();
  }
}
