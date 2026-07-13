import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/db/client", () => ({
  newId: vi.fn(() => "html-1"),
  nowIso: vi.fn(() => "2026-07-10T00:00:00.000Z")
}));

vi.mock("@worker/features/mailboxes/queries", () => ({
  findMailboxByAddress: vi.fn()
}));

vi.mock("@worker/features/messages/queries", () => ({
  ensureThread: vi.fn(),
  getMessageDetail: vi.fn(),
  insertMessage: vi.fn()
}));

import { findMailboxByAddress } from "@worker/features/mailboxes/queries";
import { ensureThread, getMessageDetail, insertMessage } from "@worker/features/messages/queries";
import { replyToMessage, sendNewMessage } from "@worker/features/send/service";
import type { WorkerEnv } from "@worker/lib/env";

const mailbox = {
  address: "support@example.com",
  createdAt: "2026-07-10T00:00:00.000Z",
  displayName: "Support",
  id: "mailbox-1",
  isActive: true,
  updatedAt: "2026-07-10T00:00:00.000Z"
};

const sentSummary = {
  createdAt: "2026-07-10T00:00:00.000Z",
  direction: "outbound" as const,
  folder: "sent" as const,
  fromAddress: mailbox.address,
  hasAttachments: false,
  id: "message-1",
  mailboxId: mailbox.id,
  readAt: "2026-07-10T00:00:00.000Z",
  receivedAt: null,
  sentAt: "2026-07-10T00:00:00.000Z",
  snippet: "Hello",
  starredAt: null,
  subject: "Hello",
  threadId: "thread-1",
  to: ["owner@example.com"]
};

describe("send service", () => {
  const send = vi.fn();
  const put = vi.fn();
  const env = {
    ASSETS: {} as Fetcher,
    BETTER_AUTH_SECRET: "test-secret",
    DB: {} as D1Database,
    MAIL_OBJECTS: { put } as unknown as R2Bucket,
    MAIL_SENDER: { send } as unknown as SendEmail
  } satisfies WorkerEnv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(findMailboxByAddress).mockResolvedValue(mailbox);
    vi.mocked(ensureThread).mockResolvedValue("thread-1");
    vi.mocked(insertMessage).mockResolvedValue(sentSummary);
  });

  it("uses Cloudflare's generated Message-ID for new messages", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-new@example.com>" });

    await sendNewMessage(env, {
      bcc: [],
      cc: [],
      from: mailbox.address,
      subject: "Hello",
      text: "Hello",
      to: ["owner@example.com"]
    });

    expect(send).toHaveBeenCalledWith({
      from: mailbox.address,
      subject: "Hello",
      text: "Hello",
      to: ["owner@example.com"]
    });
    expect(insertMessage).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({ messageId: "<cloudflare-new@example.com>" })
    );
  });

  it("keeps only allowlisted threading headers on replies", async () => {
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...sentSummary,
      attachments: [],
      bcc: [],
      cc: [],
      direction: "inbound",
      folder: "inbox",
      fromAddress: "owner@example.com",
      htmlAvailable: false,
      inReplyTo: null,
      messageId: "<original@example.com>",
      references: ["<earlier@example.com>"],
      textBody: "Original"
    });
    send.mockResolvedValue({ messageId: "<cloudflare-reply@example.com>" });

    await replyToMessage(env, {
      from: mailbox.address,
      messageId: "message-1",
      text: "Reply"
    });

    expect(send).toHaveBeenCalledWith({
      from: mailbox.address,
      headers: {
        "In-Reply-To": "<original@example.com>",
        References: "<earlier@example.com> <original@example.com>"
      },
      subject: "Re: Hello",
      text: "Reply",
      to: ["owner@example.com"]
    });
    expect(insertMessage).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({ messageId: "<cloudflare-reply@example.com>" })
    );
  });
});
