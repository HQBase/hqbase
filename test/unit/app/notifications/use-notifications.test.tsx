// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { useNotifications } from "@/features/notifications/use-notifications";
import { flushHookEffects, renderHook } from "../render-hook";

const mocks = vi.hoisted(() => ({
  applyUnreadIndicators: vi.fn(async () => undefined),
  currentPushSubscription: vi.fn(),
  getNotificationStatus: vi.fn(),
  saveNotificationSubscription: vi.fn(async () => undefined)
}));

vi.mock("@/features/notifications/api", () => ({
  deleteNotificationSubscription: vi.fn(async () => undefined),
  getNotificationStatus: mocks.getNotificationStatus,
  saveNotificationSubscription: mocks.saveNotificationSubscription
}));
vi.mock("@/features/notifications/browser", () => ({
  applyUnreadIndicators: mocks.applyUnreadIndicators,
  currentPushSubscription: mocks.currentPushSubscription,
  notificationPermission: () => "granted",
  serializePushSubscription: (subscription: { endpoint: string }) => ({
    endpoint: subscription.endpoint,
    expirationTime: null,
    keys: { auth: "auth", p256dh: "p256dh" }
  }),
  subscribeToPush: vi.fn(),
  supportsPushNotifications: () => true
}));

describe("useNotifications", () => {
  it("refreshes status only when asked and reconciles the current device", async () => {
    const subscription = { endpoint: "https://push.example/device" };
    const status = {
      latestInboundMessageId: "message-2",
      unread: { catchall: 1, inbox: 2, inboxByMailbox: { "mailbox-1": 2 }, total: 3 },
      vapidPublicKey: "public-key"
    };
    mocks.currentPushSubscription.mockResolvedValue(subscription);
    mocks.getNotificationStatus.mockResolvedValue(status);
    const initialProps: { userId: string | null } = { userId: "user-1" };
    const hook = await renderHook(({ userId }: { userId: string | null }) => {
      return useNotifications(userId);
    }, initialProps);

    expect(mocks.getNotificationStatus).not.toHaveBeenCalled();
    await flushHookEffects(() => hook.result.refresh());

    expect(hook.result.unread).toEqual(status.unread);
    expect(hook.result.deviceState).toBe("enabled");
    expect(mocks.saveNotificationSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: subscription.endpoint })
    );
    expect(mocks.applyUnreadIndicators).toHaveBeenLastCalledWith(status.unread);

    await hook.rerender({ userId: null });
    expect(hook.result.unread).toEqual({ catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 });
    expect(hook.result.deviceState).toBe("checking");
    await hook.unmount();
  });
});
