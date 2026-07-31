import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(statusCode: number) {
      super("push failed");
      this.statusCode = statusCode;
    }
  }
  return {
    default: {
      WebPushError,
      sendNotification: vi.fn(),
      setVapidDetails: vi.fn()
    }
  };
});
vi.mock("@worker/auth/mailbox-access", () => ({ accessibleMailboxIds: vi.fn() }));
vi.mock("@worker/features/notifications/queries", () => ({
  countUnreadMessages: vi.fn(),
  listPushSubscriptionsForMailbox: vi.fn(),
  markPushSubscriptionSuccessful: vi.fn(),
  removePushSubscriptionsById: vi.fn()
}));

import { accessibleMailboxIds } from "@worker/auth/mailbox-access";
import { notifyInboundMessage } from "@worker/features/notifications/delivery";
import {
  countUnreadMessages,
  listPushSubscriptionsForMailbox,
  markPushSubscriptionSuccessful,
  removePushSubscriptionsById
} from "@worker/features/notifications/queries";
import type { WorkerEnv } from "@worker/lib/env";
import webpush from "web-push";

const message = {
  id: "msg_1",
  threadId: "thr_1",
  mailboxId: "mbx_1",
  direction: "inbound" as const,
  folder: "inbox" as const,
  fromAddress: "sender@example.com",
  to: ["support@example.com"],
  subject: "Private subject",
  snippet: "Private snippet",
  receivedAt: "2026-07-29T12:00:00.000Z",
  sentAt: null,
  readAt: null,
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-07-29T12:00:00.000Z"
};
const env = {
  DB: {} as D1Database,
  VAPID_PRIVATE_KEY: "private",
  VAPID_PUBLIC_KEY: "public",
  VAPID_SUBJECT: "https://hqbase.io"
} as unknown as WorkerEnv;

describe("push delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accessibleMailboxIds).mockResolvedValue(["mbx_1"]);
    vi.mocked(countUnreadMessages).mockResolvedValue({
      catchall: 1,
      inbox: 2,
      inboxByMailbox: { mbx_1: 2 },
      total: 3
    });
    vi.mocked(listPushSubscriptionsForMailbox).mockResolvedValue([
      {
        id: "push_1",
        user_id: "usr_1",
        endpoint: "https://push.example/one",
        p256dh_key: "p256dh",
        auth_key: "auth",
        expiration_time: null,
        role: "owner"
      },
      {
        id: "push_2",
        user_id: "usr_1",
        endpoint: "https://push.example/two",
        p256dh_key: "p256dh",
        auth_key: "auth",
        expiration_time: null,
        role: "owner"
      }
    ]);
  });

  it("sends a minimal encrypted payload to every device and records success", async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({
      body: "",
      headers: {},
      statusCode: 201
    });
    await notifyInboundMessage(env, message);

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(
      vi.mocked(webpush.sendNotification).mock.calls[0]?.[1] as string
    ) as Record<string, unknown>;
    expect(payload).toEqual({
      tag: "hqbase-thread-thr_1",
      unreadCount: 3,
      url: "/inbox/msg_1"
    });
    expect(JSON.stringify(payload)).not.toContain(message.fromAddress);
    expect(JSON.stringify(payload)).not.toContain(message.subject);
    expect(JSON.stringify(payload)).not.toContain(message.snippet);
    expect(markPushSubscriptionSuccessful).toHaveBeenCalledTimes(2);
    expect(removePushSubscriptionsById).toHaveBeenCalledWith(env.DB, []);
  });

  it("prunes gone subscriptions and isolates transient delivery failures", async () => {
    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 503 });
    await expect(notifyInboundMessage(env, message)).resolves.toBeUndefined();
    expect(removePushSubscriptionsById).toHaveBeenCalledWith(env.DB, ["push_1"]);
    expect(markPushSubscriptionSuccessful).not.toHaveBeenCalled();
  });

  it("rechecks live mailbox access before sending", async () => {
    vi.mocked(accessibleMailboxIds).mockResolvedValue([]);
    await notifyInboundMessage(env, message);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(countUnreadMessages).not.toHaveBeenCalled();
  });

  it("does nothing when the stored message has no mailbox", async () => {
    await notifyInboundMessage(env, { ...message, mailboxId: null });
    expect(listPushSubscriptionsForMailbox).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
