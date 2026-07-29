import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/notifications/api", () => ({
  deleteNotificationSubscription: mocks.deleteNotificationSubscription
}));
vi.mock("@/features/notifications/browser", () => ({
  currentPushSubscription: mocks.currentPushSubscription
}));

const mocks = vi.hoisted(() => ({
  currentPushSubscription: vi.fn(),
  deleteNotificationSubscription: vi.fn()
}));

import { disableCurrentDeviceNotificationsBeforeSignOut } from "@/features/notifications/sign-out";

describe("notification sign-out cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unsubscribes the browser even when server cleanup fails", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    mocks.currentPushSubscription.mockResolvedValue({
      endpoint: "https://push.example/device",
      unsubscribe
    });
    mocks.deleteNotificationSubscription.mockRejectedValue(new Error("offline"));

    await expect(disableCurrentDeviceNotificationsBeforeSignOut()).rejects.toThrow("offline");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
