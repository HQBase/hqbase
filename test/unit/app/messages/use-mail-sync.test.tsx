// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSummary } from "@/features/messages/types";
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
    unread: { catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 }
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
    unread: { catchall: 0, inbox: 1, inboxByMailbox: { "mailbox-1": 1 }, total: 1 },
    vapidPublicKey: null
  };
}

function conversation(id: string, receivedAt: string): ConversationSummary {
  return {
    createdAt: receivedAt,
    direction: "inbound",
    folder: "inbox",
    fromAddress: `${id}@example.com`,
    hasAttachments: false,
    id,
    isStarred: false,
    mailboxId: "mailbox-1",
    messageCount: 1,
    readAt: null,
    receivedAt,
    sentAt: null,
    snippet: `Preview ${id}`,
    starredAt: null,
    subject: `Subject ${id}`,
    threadId: `thread-${id}`,
    to: ["support@example.com"],
    unreadCount: 1
  };
}

describe("useMailSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listConversations.mockReset();
    mocks.refreshNotifications.mockReset();
  });

  it("uses one refresh path for initial load, focus, unread state, and incoming sound", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    mocks.listConversations.mockResolvedValue({
      conversations: [],
      nextCursor: null,
      totalCount: 0
    });
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
    expect(hook.result.totalCount).toBe(0);
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

  it("loads older cursor pages and keeps them through a newest-page refresh", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    const first = conversation("message-1", "2026-07-30T12:00:00.000Z");
    const second = conversation("message-2", "2026-07-30T11:00:00.000Z");
    const newest = conversation("message-0", "2026-07-30T13:00:00.000Z");
    mocks.listConversations
      .mockResolvedValueOnce({
        conversations: [first],
        nextCursor: "cursor-1",
        totalCount: 2
      })
      .mockResolvedValueOnce({
        conversations: [second],
        nextCursor: null,
        totalCount: null
      })
      .mockResolvedValueOnce({
        conversations: [newest, first],
        nextCursor: "cursor-2",
        totalCount: 3
      });
    mocks.refreshNotifications
      .mockResolvedValueOnce(status("message-1"))
      .mockResolvedValueOnce(status("message-1"));

    const hook = await renderHook(useMailSync, {
      activeFolder: "inbox",
      mailboxId: "all",
      search: "",
      userId: "user-1"
    });
    await flushHookEffects();

    expect(hook.result.hasMore).toBe(true);
    expect(hook.result.totalCount).toBe(2);
    await flushHookEffects(() => hook.result.loadMore());
    expect(mocks.listConversations).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor-1" })
    );
    expect(hook.result.conversations.map((item) => item.id)).toEqual(["message-1", "message-2"]);
    expect(hook.result.hasMore).toBe(false);
    expect(hook.result.totalCount).toBe(2);

    await flushHookEffects(() => window.dispatchEvent(new Event("focus")));
    expect(hook.result.conversations.map((item) => item.id)).toEqual([
      "message-0",
      "message-1",
      "message-2"
    ]);
    expect(hook.result.hasMore).toBe(false);
    expect(hook.result.totalCount).toBe(3);
    await hook.unmount();
  });

  it("keeps the cursor available when loading an older page fails", async () => {
    const first = conversation("message-1", "2026-07-30T12:00:00.000Z");
    mocks.listConversations
      .mockResolvedValueOnce({
        conversations: [first],
        nextCursor: "cursor-1",
        totalCount: 1
      })
      .mockRejectedValueOnce(new Error("Older conversations are unavailable."));
    mocks.refreshNotifications.mockResolvedValueOnce(status("message-1"));

    const hook = await renderHook(useMailSync, {
      activeFolder: "inbox",
      mailboxId: "all",
      search: "",
      userId: "user-1"
    });
    await flushHookEffects();
    await flushHookEffects(() => hook.result.loadMore());

    expect(hook.result.isLoadingMore).toBe(false);
    expect(hook.result.loadMoreError).toBe("Older conversations are unavailable.");
    expect(hook.result.hasMore).toBe(true);
    await hook.unmount();
  });

  it("reconciles conversation actions across every loaded page", async () => {
    const conversations = ["read", "unread", "star", "unstar", "archive", "trash"].map(
      (action, index) => conversation(`message-${action}`, `2026-07-30T1${index}:00:00.000Z`)
    );
    mocks.listConversations.mockResolvedValueOnce({
      conversations,
      nextCursor: null,
      totalCount: conversations.length
    });
    mocks.refreshNotifications.mockResolvedValueOnce(status("message-read"));

    const hook = await renderHook(useMailSync, {
      activeFolder: "inbox",
      mailboxId: "all",
      search: "",
      userId: "user-1"
    });
    await flushHookEffects();
    await flushHookEffects(() => {
      hook.result.applyConversationAction("thread-message-read", "read", 1);
      hook.result.applyConversationAction("thread-message-unread", "unread", 1);
      hook.result.applyConversationAction("thread-message-star", "star", 1);
      hook.result.applyConversationAction("thread-message-unstar", "unstar", 1);
      hook.result.applyConversationAction("thread-message-archive", "archive", 1);
      hook.result.applyConversationAction("thread-message-trash", "trash", 1);
      hook.result.applyConversationAction("thread-missing", "read", 0);
    });

    expect(hook.result.conversations.map((item) => item.id)).toEqual([
      "message-read",
      "message-unread",
      "message-star",
      "message-unstar"
    ]);
    expect(hook.result.conversations.find((item) => item.id === "message-read")?.unreadCount).toBe(
      0
    );
    expect(
      hook.result.conversations.find((item) => item.id === "message-unread")?.unreadCount
    ).toBe(1);
    expect(hook.result.conversations.find((item) => item.id === "message-star")?.isStarred).toBe(
      true
    );
    expect(hook.result.conversations.find((item) => item.id === "message-unstar")?.isStarred).toBe(
      false
    );
    expect(hook.result.totalCount).toBe(4);
    await hook.unmount();
  });
});
