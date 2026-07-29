// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMailSync } from "@/features/messages/use-mail-sync";
import { flushHookEffects, renderHook } from "../render-hook";

const mocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  playNotificationSound: vi.fn(),
  refreshNotifications: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("@/features/messages/api", () => ({
  listConversations: mocks.listConversations
}));
vi.mock("@/features/notifications/use-notifications", () => ({
  useNotifications: () => ({
    deviceState: "available",
    disable: vi.fn(),
    enable: vi.fn(),
    error: null,
    isBusy: false,
    refresh: mocks.refreshNotifications,
    unread: { catchall: 0, inbox: 0, total: 0 }
  })
}));
vi.mock("@/lib/notification-sounds", () => ({
  playNotificationSound: mocks.playNotificationSound
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError }
}));

function status(latestInboundMessageId: string) {
  return {
    latestInboundMessageId,
    unread: { catchall: 0, inbox: 1, total: 1 },
    vapidPublicKey: null
  };
}

describe("useMailSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses one refresh path for initial load, focus, unread state, and incoming sound", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    mocks.listConversations.mockResolvedValue([]);
    mocks.refreshNotifications
      .mockResolvedValueOnce(status("message-1"))
      .mockResolvedValueOnce(status("message-2"));
    const hook = await renderHook(useMailSync, {
      activeFolder: "inbox",
      mailboxId: "all",
      search: "",
      userId: "user-1"
    });
    await flushHookEffects();

    expect(mocks.listConversations).toHaveBeenCalledOnce();
    expect(mocks.refreshNotifications).toHaveBeenCalledOnce();
    expect(mocks.playNotificationSound).not.toHaveBeenCalled();

    await flushHookEffects(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.listConversations).toHaveBeenCalledTimes(2);
    expect(mocks.refreshNotifications).toHaveBeenCalledTimes(2);
    expect(mocks.playNotificationSound).toHaveBeenCalledWith("incoming-email");
    expect(hook.result.conversations).toEqual([]);
    await hook.unmount();
  });

  it("reports an initial conversation failure without coupling it to notification refresh", async () => {
    mocks.listConversations.mockRejectedValueOnce(new Error("Conversations are unavailable."));
    mocks.refreshNotifications.mockResolvedValueOnce(status("message-1"));

    const hook = await renderHook(useMailSync, {
      activeFolder: "inbox",
      mailboxId: "all",
      search: "",
      userId: "user-1"
    });
    await flushHookEffects();

    expect(mocks.refreshNotifications).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledWith("Conversations are unavailable.");
    await hook.unmount();
  });
});
