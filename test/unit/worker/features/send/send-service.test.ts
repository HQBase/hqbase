import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/db/client", () => ({
  newId: vi.fn(() => "html-1"),
  nowIso: vi.fn(() => "2026-07-10T00:00:00.000Z")
}));

vi.mock("@worker/features/mailboxes/queries", () => ({
  findMailboxForSending: vi.fn()
}));
vi.mock("@worker/features/mailboxes/address-queries", () => ({
  findAddressIdentity: vi.fn().mockResolvedValue(null)
}));

vi.mock("@worker/features/messages/queries", () => ({
  getMessageDetail: vi.fn(),
  getMessageHtmlKey: vi.fn(),
  insertAttachment: vi.fn(),
  insertMessage: vi.fn()
}));
vi.mock("@worker/features/messages/threading", () => ({
  createThread: vi.fn(),
  touchThread: vi.fn()
}));

import { findMailboxForSending } from "@worker/features/mailboxes/queries";
import {
  getMessageDetail,
  getMessageHtmlKey,
  insertAttachment,
  insertMessage
} from "@worker/features/messages/queries";
import { createThread, touchThread } from "@worker/features/messages/threading";
import { replyToMessage, sendNewMessage } from "@worker/features/send/service";
import type { WorkerEnv } from "@worker/lib/env";

const mailbox = {
  addresses: [],
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
  const get = vi.fn();
  const put = vi.fn();
  const env = {
    ASSETS: {} as Fetcher,
    BETTER_AUTH_SECRET: "test-secret",
    CLOUDFLARE_OAUTH_CLIENT_ID: "1c413f324b518b452096929b847e6703",
    DB: {} as D1Database,
    HQBASE_APP_VERSION: "0.1.3",
    HQBASE_RELEASE_PUBLIC_KEY: "MCowBQYDK2VwAyEAsVwKniCvpHDwbbnjTPP0SuIIG97cRL+iFBQvay9OrU4=",
    HQBASE_RELEASE_MANIFEST_URL:
      "https://github.com/HQBase/hqbase/releases/latest/download/stable.json",
    HQBASE_WORKER_NAME: "hqbase",
    MAIL_OBJECTS: { get, put } as unknown as R2Bucket,
    MAIL_SENDER: { send } as unknown as SendEmail,
    HQBASE_JOBS: {} as Queue
  } satisfies WorkerEnv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(findMailboxForSending).mockResolvedValue(mailbox);
    vi.mocked(createThread).mockResolvedValue("thread-1");
    vi.mocked(touchThread).mockResolvedValue();
    vi.mocked(insertMessage).mockResolvedValue(sentSummary);
  });

  it("uses Cloudflare's generated Message-ID for new messages", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-new@example.com>" });

    await sendNewMessage(env, {
      attachmentIds: [],
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
    expect(createThread).toHaveBeenCalledWith(env.DB, "Hello", "2026-07-10T00:00:00.000Z");
  });

  it("keeps only allowlisted threading headers on replies", async () => {
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...sentSummary,
      attachments: [],
      bcc: [],
      cc: [],
      deliveredToAddress: "support@example.com",
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
      attachmentIds: [],
      bcc: ["audit@example.com"],
      cc: ["manager@example.com"],
      from: mailbox.address,
      html: "<p>Reply</p>",
      messageId: "message-1",
      text: "Reply",
      to: ["alternate@example.com"]
    });

    const quotedText = "Reply\n\nOn 2026-07-10 at 00:00 UTC, owner@example.com wrote:\n> Original";
    const quotedHtml =
      '<p>Reply</p><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr"><br>On 2026-07-10 at 00:00 UTC, owner@example.com wrote:<br></div><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">Original</blockquote></div>';
    expect(send).toHaveBeenCalledWith({
      from: mailbox.address,
      bcc: ["audit@example.com"],
      cc: ["manager@example.com"],
      headers: {
        "In-Reply-To": "<original@example.com>",
        References: "<earlier@example.com> <original@example.com>"
      },
      html: quotedHtml,
      subject: "Re: Hello",
      text: quotedText,
      to: ["alternate@example.com"]
    });
    expect(insertMessage).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        bcc: ["audit@example.com"],
        cc: ["manager@example.com"],
        htmlR2Key: "sent/2026-07-10/html-1.html",
        messageId: "<cloudflare-reply@example.com>",
        textBody: quotedText,
        to: ["alternate@example.com"]
      })
    );
    expect(createThread).not.toHaveBeenCalled();
    expect(touchThread).toHaveBeenCalledWith(env.DB, "thread-1", "2026-07-10T00:00:00.000Z");
    expect(put).toHaveBeenCalledWith("sent/2026-07-10/html-1.html", quotedHtml, {
      httpMetadata: { contentType: "text/html; charset=utf-8" }
    });
  });

  it("quotes safe rich HTML and carries referenced CID images as inline attachments", async () => {
    const inlineImage = {
      id: "attachment-1",
      messageId: "message-1",
      filename: "logo.png",
      contentType: "image/png",
      sizeBytes: 3,
      contentId: "<logo@example.com>",
      r2Key: "mail/logo.png",
      createdAt: "2026-07-10T00:00:00.000Z"
    };
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...sentSummary,
      attachments: [inlineImage],
      bcc: [],
      cc: [],
      deliveredToAddress: "support@example.com",
      direction: "inbound",
      folder: "inbox",
      fromAddress: "owner@example.com",
      htmlAvailable: true,
      inReplyTo: null,
      messageId: "<original@example.com>",
      references: [],
      textBody: "Original"
    });
    vi.mocked(getMessageHtmlKey).mockResolvedValue("mail/original.html");
    get.mockImplementation(async (key: string) => {
      if (key === "mail/original.html") {
        return {
          text: async () =>
            '<script>alert(1)</script><p><strong>Rich original</strong></p><img src="cid:logo@example.com"><img src="https://images.example.com/banner.png">'
        };
      }
      if (key === inlineImage.r2Key) {
        return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      }
      return null;
    });
    send.mockResolvedValue({ messageId: "<cloudflare-reply@example.com>" });

    await replyToMessage(env, {
      attachmentIds: [],
      bcc: [],
      cc: [],
      from: mailbox.address,
      html: "<p>Reply</p>",
      messageId: "message-1",
      text: "Reply",
      to: ["owner@example.com"]
    });

    const payload = send.mock.calls[0]?.[0] as Parameters<SendEmail["send"]>[0];
    expect(payload.html).toContain("<strong>Rich original</strong>");
    expect(payload.html).toContain('src="cid:logo@example.com"');
    expect(payload.html).toContain('src="https://images.example.com/banner.png"');
    expect(payload.html).not.toContain("<script");
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        contentId: "logo@example.com",
        disposition: "inline",
        filename: "logo.png",
        type: "image/png"
      })
    ]);
    expect(insertAttachment).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        contentId: "logo@example.com",
        messageId: "message-1",
        r2Key: "mail/logo.png"
      })
    );
  });
});
