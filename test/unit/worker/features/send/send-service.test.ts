import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/db/client", () => ({
  newId: vi.fn(() => "html-1"),
  nowIso: vi.fn(() => "2026-07-10T00:00:00.000Z")
}));
vi.mock("@worker/db/drizzle", () => ({
  getRows: vi.fn()
}));

vi.mock("@worker/features/drafts/attachment-lookups", () => ({
  draftAttachmentObjects: vi.fn()
}));
vi.mock("@worker/features/mailboxes/queries", () => ({
  findMailboxForSending: vi.fn()
}));
vi.mock("@worker/features/messages/queries", () => ({
  getMessageDetail: vi.fn(),
  getMessageHtmlKey: vi.fn(),
  insertAttachment: vi.fn(),
  insertMessage: vi.fn(),
  listThreadMessages: vi.fn()
}));
vi.mock("@worker/features/messages/threading", () => ({
  createThread: vi.fn(),
  touchThread: vi.fn()
}));

import { getRows } from "@worker/db/drizzle";
import { draftAttachmentObjects } from "@worker/features/drafts/attachment-lookups";
import { findMailboxForSending } from "@worker/features/mailboxes/queries";
import {
  getMessageDetail,
  getMessageHtmlKey,
  insertAttachment,
  insertMessage,
  listThreadMessages
} from "@worker/features/messages/queries";
import { createThread, touchThread } from "@worker/features/messages/threading";
import { replyToMessage, sendNewMessage } from "@worker/features/send/service";
import type { WorkerEnv } from "@worker/lib/env";

const mailbox = {
  address: "support@example.com",
  createdAt: "2026-07-10T00:00:00.000Z",
  deletedAt: null,
  displayName: "Support",
  id: "mailbox-1",
  kind: "human" as const,
  isActive: true,
  mailDomainId: "domain-1",
  updatedAt: "2026-07-10T00:00:00.000Z"
};

const sentSummary = {
  createdAt: "2026-07-10T00:00:00.000Z",
  direction: "outbound" as const,
  folder: "sent" as const,
  fromAddress: mailbox.address,
  fromName: mailbox.displayName,
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
  const deleteObject = vi.fn();
  const batch = vi.fn();
  const preparedStatement = { bind: vi.fn() };
  preparedStatement.bind.mockReturnValue(preparedStatement);
  const prepare = vi.fn(() => preparedStatement);
  const get = vi.fn();
  const put = vi.fn();
  const env = {
    ASSETS: {} as Fetcher,
    BETTER_AUTH_SECRET: "test-secret",
    CLOUDFLARE_OAUTH_CLIENT_ID: "1c413f324b518b452096929b847e6703",
    DB: { batch, prepare } as unknown as D1Database,
    HQBASE_APP_VERSION: "0.1.3",
    HQBASE_RELEASE_PUBLIC_KEY: "MCowBQYDK2VwAyEAsVwKniCvpHDwbbnjTPP0SuIIG97cRL+iFBQvay9OrU4=",
    HQBASE_RELEASE_MANIFEST_URL:
      "https://github.com/HQBase/hqbase/releases/latest/download/stable.json",
    HQBASE_WORKER_NAME: "hqbase",
    MAIL_EVENTS: {} as WorkerEnv["MAIL_EVENTS"],
    MAIL_OBJECTS: { delete: deleteObject, get, put } as unknown as R2Bucket,
    MAIL_SENDER: { send } as unknown as SendEmail,
    HQBASE_JOBS: {} as Queue
  } satisfies WorkerEnv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(findMailboxForSending).mockResolvedValue(mailbox);
    vi.mocked(createThread).mockResolvedValue("thread-1");
    vi.mocked(touchThread).mockResolvedValue();
    vi.mocked(insertMessage).mockResolvedValue(sentSummary);
    vi.mocked(draftAttachmentObjects).mockResolvedValue([]);
    vi.mocked(getRows).mockResolvedValue([]);
    deleteObject.mockResolvedValue(undefined);
    batch.mockResolvedValue([]);
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
      from: { name: mailbox.displayName, email: mailbox.address },
      subject: "Hello",
      text: "Hello",
      to: ["owner@example.com"]
    });
    expect(insertMessage).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        fromName: mailbox.displayName,
        messageId: "<cloudflare-new@example.com>"
      })
    );
    expect(findMailboxForSending).toHaveBeenCalledOnce();
    expect(createThread).toHaveBeenCalledWith(env.DB, "Hello", "2026-07-10T00:00:00.000Z");
  });

  it("sends and stores one resolved signature after the authored content", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-signature@example.com>" });

    await sendNewMessage(
      env,
      {
        attachmentIds: [],
        bcc: [],
        cc: [],
        from: mailbox.address,
        subject: "Signed",
        text: "Hello",
        to: ["owner@example.com"]
      },
      "user-1",
      {
        mode: "selected",
        id: "sig_support",
        name: "Support",
        text: "Jane\nSupport",
        html: "<p>Jane<br>Support</p>"
      }
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Hello\n\nJane\nSupport",
        html: "<p>Hello</p><br><br><p>Jane<br>Support</p>"
      })
    );
    expect(insertMessage).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({ textBody: "Hello\n\nJane\nSupport" })
    );
  });

  it("converts signature data images to private CID attachments", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-signature-image@example.com>" });
    const image = "data:image/png;base64,iVBORw0KGgo=";

    await sendNewMessage(
      env,
      {
        attachmentIds: [],
        bcc: [],
        cc: [],
        from: mailbox.address,
        subject: "Signed image",
        text: "Hello",
        to: ["owner@example.com"]
      },
      "user-1",
      {
        mode: "selected",
        id: "sig_support",
        name: "Support",
        text: "Support logo",
        html: `<p>Support</p><img src="${image}" alt="Support logo" width="64" height="64">`
      }
    );

    const payload = send.mock.calls[0]?.[0] as Parameters<SendEmail["send"]>[0];
    expect(payload.html).toContain('src="cid:html-1-1@hqbase.invalid"');
    expect(payload.html).not.toContain("data:image");
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        contentId: "html-1-1@hqbase.invalid",
        disposition: "inline",
        filename: "signature-image-1.png",
        type: "image/png"
      })
    ]);
    expect(put).toHaveBeenCalledWith("sent/2026-07-10/html-1-1.png", expect.any(ArrayBuffer), {
      httpMetadata: { contentType: "image/png" }
    });
    expect(insertMessage).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({ hasAttachments: false })
    );
    expect(insertAttachment).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        contentId: "html-1-1@hqbase.invalid",
        r2Key: "sent/2026-07-10/html-1-1.png"
      })
    );
  });

  it("sends and stores inline images from forwarded HTML context", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-forward-image@example.com>" });

    await sendNewMessage(
      env,
      {
        attachmentIds: [],
        bcc: [],
        cc: [],
        from: mailbox.address,
        subject: "Forwarded image",
        text: "Please review",
        to: ["owner@example.com"]
      },
      undefined,
      undefined,
      {
        text: "Forwarded content",
        html: '<blockquote><img src="cid:forwarded-logo@example.com"></blockquote>'
      },
      [
        {
          id: "forwarded-logo",
          filename: "logo.png",
          contentType: "image/png",
          sizeBytes: 3,
          contentId: "forwarded-logo@example.com",
          disposition: "inline",
          r2Key: "mail/original-logo.png",
          content: new Uint8Array([1, 2, 3]).buffer
        }
      ]
    );

    const payload = send.mock.calls[0]?.[0] as Parameters<SendEmail["send"]>[0];
    expect(payload.html).toContain('src="cid:forwarded-logo@example.com"');
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        contentId: "forwarded-logo@example.com",
        disposition: "inline",
        filename: "logo.png"
      })
    ]);
    expect(put).toHaveBeenCalledWith("sent/2026-07-10/html-1-1", expect.any(ArrayBuffer), {
      httpMetadata: { contentType: "image/png" }
    });
    expect(insertAttachment).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        contentId: "forwarded-logo@example.com",
        r2Key: "sent/2026-07-10/html-1-1"
      })
    );
  });

  it("uses only referenced private draft images and removes unused draft objects", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-inline@example.com>" });
    vi.mocked(draftAttachmentObjects).mockResolvedValue([
      {
        id: "attachment-inline",
        draftId: "draft-1",
        filename: "chart.png",
        contentType: "image/png",
        sizeBytes: 3,
        contentId: "attachment-inline@hqbase.invalid",
        r2Key: "drafts/user-1/draft-1/attachment-inline",
        content: new Uint8Array([1, 2, 3]).buffer
      }
    ]);
    vi.mocked(getRows).mockResolvedValue([
      { r2_key: "drafts/user-1/draft-1/attachment-inline" },
      { r2_key: "drafts/user-1/draft-1/unused" }
    ]);

    await sendNewMessage(
      env,
      {
        attachmentIds: ["attachment-inline"],
        bcc: [],
        cc: [],
        draftId: "draft-1",
        from: mailbox.address,
        html: '<p>Hello<img src="/api/v2/drafts/draft-1/attachments/attachment-inline/inline" width="320"></p>',
        subject: "Inline",
        text: "Hello",
        to: ["owner@example.com"]
      },
      "user-1"
    );

    const payload = send.mock.calls[0]?.[0] as Parameters<SendEmail["send"]>[0];
    expect(payload.html).toContain('src="cid:attachment-inline@hqbase.invalid"');
    expect(payload.html).not.toContain("/api/v2/drafts/");
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        contentId: "attachment-inline@hqbase.invalid",
        disposition: "inline",
        filename: "chart.png"
      })
    ]);
    expect(insertAttachment).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({ r2Key: "sent/2026-07-10/html-1-1" })
    );
    expect(deleteObject).toHaveBeenCalledWith([
      "drafts/user-1/draft-1/attachment-inline",
      "drafts/user-1/draft-1/unused"
    ]);
  });

  it("uses the attachment's owning draft when an API client omits draftId", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-derived-inline@example.com>" });
    vi.mocked(draftAttachmentObjects).mockResolvedValue([
      {
        id: "attachment-inline",
        draftId: "draft-1",
        filename: "chart.png",
        contentType: "image/png",
        sizeBytes: 3,
        contentId: "attachment-inline@hqbase.invalid",
        r2Key: "drafts/user-1/draft-1/attachment-inline",
        content: new Uint8Array([1, 2, 3]).buffer
      }
    ]);

    await sendNewMessage(
      env,
      {
        attachmentIds: ["attachment-inline"],
        bcc: [],
        cc: [],
        from: mailbox.address,
        html: '<p>Hello<img src="/api/v1/drafts/draft-1/attachments/attachment-inline/inline"></p>',
        subject: "Inline",
        text: "Hello",
        to: ["owner@example.com"]
      },
      "user-1"
    );

    const payload = send.mock.calls[0]?.[0] as Parameters<SendEmail["send"]>[0];
    expect(payload.html).toContain('src="cid:attachment-inline@hqbase.invalid"');
    expect(insertAttachment).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({ r2Key: "sent/2026-07-10/html-1-1" })
    );
    expect(batch).not.toHaveBeenCalled();
  });

  it("copies attachments from multiple owned drafts when draftId is omitted", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-forward-attachments@example.com>" });
    vi.mocked(draftAttachmentObjects).mockResolvedValue([
      {
        id: "attachment-inline",
        draftId: "draft-1",
        filename: "chart.png",
        contentType: "image/png",
        sizeBytes: 3,
        contentId: "attachment-inline@hqbase.invalid",
        r2Key: "drafts/user-1/draft-1/attachment-inline",
        content: new Uint8Array([1, 2, 3]).buffer
      },
      {
        id: "attachment-file",
        draftId: "draft-2",
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        contentId: null,
        r2Key: "drafts/user-1/draft-2/attachment-file",
        content: new Uint8Array([4, 5, 6]).buffer
      }
    ]);

    await sendNewMessage(
      env,
      {
        attachmentIds: ["attachment-inline", "attachment-file"],
        bcc: [],
        cc: [],
        from: mailbox.address,
        html: '<p>Hello<img src="/api/v2/drafts/draft-1/attachments/attachment-inline/inline"></p>',
        subject: "Forward attachments",
        text: "Hello",
        to: ["owner@example.com"]
      },
      "user-1"
    );

    const payload = send.mock.calls[0]?.[0] as Parameters<SendEmail["send"]>[0];
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        contentId: "attachment-inline@hqbase.invalid",
        disposition: "inline"
      }),
      expect.objectContaining({ disposition: "attachment", filename: "report.pdf" })
    ]);
    expect(put).toHaveBeenCalledWith("sent/2026-07-10/html-1-1", expect.any(ArrayBuffer), {
      httpMetadata: { contentType: "image/png" }
    });
    expect(put).toHaveBeenCalledWith("sent/2026-07-10/html-1-2", expect.any(ArrayBuffer), {
      httpMetadata: { contentType: "application/pdf" }
    });
  });

  it("rejects attachments from a different explicit draft", async () => {
    vi.mocked(draftAttachmentObjects).mockResolvedValue([
      {
        id: "attachment-other",
        draftId: "draft-2",
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        contentId: null,
        r2Key: "drafts/user-1/draft-2/attachment-other",
        content: new Uint8Array([1, 2, 3]).buffer
      }
    ]);

    await expect(
      sendNewMessage(
        env,
        {
          attachmentIds: ["attachment-other"],
          bcc: [],
          cc: [],
          draftId: "draft-1",
          from: mailbox.address,
          subject: "Wrong draft",
          text: "Hello",
          to: ["owner@example.com"]
        },
        "user-1"
      )
    ).rejects.toMatchObject({ code: "ATTACHMENT_DRAFT_MISMATCH", status: 400 });
    expect(send).not.toHaveBeenCalled();
  });

  it("chunks cleanup for drafts with more than 1,000 staged objects", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-cleanup@example.com>" });
    vi.mocked(getRows).mockResolvedValue(
      Array.from({ length: 1_001 }, (_value, index) => ({ r2_key: `drafts/object-${index}` }))
    );

    await sendNewMessage(
      env,
      {
        attachmentIds: [],
        bcc: [],
        cc: [],
        draftId: "draft-1",
        from: mailbox.address,
        subject: "Cleanup",
        text: "Hello",
        to: ["owner@example.com"]
      },
      "user-1"
    );

    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(deleteObject.mock.calls[0]?.[0]).toHaveLength(1_000);
    expect(deleteObject.mock.calls[1]?.[0]).toEqual(["drafts/object-1000"]);
  });

  it("removes staged signature objects when delivery fails", async () => {
    send.mockRejectedValue(new Error("delivery failed"));

    await expect(
      sendNewMessage(
        env,
        {
          attachmentIds: [],
          bcc: [],
          cc: [],
          from: mailbox.address,
          subject: "Signed image",
          text: "Hello",
          to: ["owner@example.com"]
        },
        "user-1",
        {
          mode: "selected",
          id: "sig_support",
          name: "Support",
          text: "Support logo",
          html: '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Support logo">'
        }
      )
    ).rejects.toThrow("delivery failed");

    expect(deleteObject).toHaveBeenCalledWith(["sent/2026-07-10/html-1-1.png"]);
  });

  it("removes unrecorded signature objects when post-send persistence fails", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-signature-image@example.com>" });
    vi.mocked(createThread).mockRejectedValue(new Error("D1 unavailable"));

    await expect(
      sendNewMessage(
        env,
        {
          attachmentIds: [],
          bcc: [],
          cc: [],
          from: mailbox.address,
          subject: "Signed image",
          text: "Hello",
          to: ["owner@example.com"]
        },
        "user-1",
        {
          mode: "selected",
          id: "sig_support",
          name: "Support",
          text: "Support logo",
          html: '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Support logo">'
        }
      )
    ).rejects.toThrow("D1 unavailable");

    expect(send).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledWith(["sent/2026-07-10/html-1-1.png"]);
  });

  it("removes an unrecorded HTML body when persistence fails after upload", async () => {
    send.mockResolvedValue({ messageId: "<cloudflare-html@example.com>" });
    vi.mocked(touchThread).mockRejectedValue(new Error("D1 unavailable"));

    await expect(
      sendNewMessage(env, {
        attachmentIds: [],
        bcc: [],
        cc: [],
        from: mailbox.address,
        html: "<p>Hello</p>",
        subject: "HTML cleanup",
        text: "Hello",
        to: ["owner@example.com"]
      })
    ).rejects.toThrow("D1 unavailable");

    expect(put).toHaveBeenCalledWith("sent/2026-07-10/html-1.html", "<p>Hello</p>", {
      httpMetadata: { contentType: "text/html; charset=utf-8" }
    });
    expect(deleteObject).toHaveBeenCalledWith(["sent/2026-07-10/html-1.html"]);
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
      fromName: "Owner Example",
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

    const quotedText =
      "Reply\n\nOn 2026-07-10 at 00:00 UTC, Owner Example <owner@example.com> wrote:\n> Original";
    const quotedHtml =
      '<p>Reply</p><br><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr"><br>On 2026-07-10 at 00:00 UTC, Owner Example &lt;owner@example.com&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">Original</blockquote></div>';
    expect(send).toHaveBeenCalledWith({
      from: { name: mailbox.displayName, email: mailbox.address },
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
        fromName: mailbox.displayName,
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

  it("quotes accessible thread messages through the selected reply target", async () => {
    const firstMessage = {
      ...sentSummary,
      id: "message-1",
      attachments: [],
      bcc: [],
      cc: [],
      deliveredToAddress: "support@example.com",
      direction: "inbound" as const,
      folder: "inbox" as const,
      fromAddress: "owner@example.com",
      fromName: "Owner Example",
      htmlAvailable: false,
      inReplyTo: null,
      messageId: "<first@example.com>",
      references: [],
      textBody: "First message"
    };
    const targetMessage = {
      ...firstMessage,
      id: "message-2",
      direction: "outbound" as const,
      folder: "sent" as const,
      fromAddress: mailbox.address,
      fromName: mailbox.displayName,
      to: ["owner@example.com"],
      deliveredToAddress: null,
      inReplyTo: "<first@example.com>",
      messageId: "<target@example.com>",
      references: ["<first@example.com>"],
      snippet: "Second message",
      textBody: "Second message",
      receivedAt: null,
      sentAt: "2026-07-10T00:05:00.000Z",
      createdAt: "2026-07-10T00:05:00.000Z"
    };
    const laterMessage = {
      ...targetMessage,
      id: "message-3",
      direction: "inbound" as const,
      folder: "inbox" as const,
      fromAddress: "owner@example.com",
      fromName: "Owner Example",
      messageId: "<later@example.com>",
      snippet: "Later message",
      textBody: "Later message",
      receivedAt: "2026-07-10T00:10:00.000Z",
      sentAt: null,
      createdAt: "2026-07-10T00:10:00.000Z"
    };
    vi.mocked(getMessageDetail).mockResolvedValue(targetMessage);
    vi.mocked(listThreadMessages).mockResolvedValue([firstMessage, targetMessage, laterMessage]);
    send.mockResolvedValue({ messageId: "<cloudflare-reply@example.com>" });

    await replyToMessage(
      env,
      {
        attachmentIds: [],
        bcc: [],
        cc: [],
        from: mailbox.address,
        messageId: targetMessage.id,
        text: "Third message",
        to: ["owner@example.com"]
      },
      "user-1",
      undefined,
      { includeUnassigned: false, mailboxIds: [mailbox.id] }
    );

    expect(listThreadMessages).toHaveBeenCalledWith(env.DB, "thread-1", {
      includeUnassigned: false,
      mailboxIds: [mailbox.id]
    });
    const payload = send.mock.calls[0]?.[0] as Parameters<SendEmail["send"]>[0];
    expect(payload.headers).toEqual({
      "In-Reply-To": "<target@example.com>",
      References: "<first@example.com> <target@example.com>"
    });
    const payloadText = payload.text ?? "";
    expect(payloadText).toContain("Second message");
    expect(payloadText).toContain("First message");
    expect(payloadText).not.toContain("Later message");
    expect(payloadText.indexOf("Second message")).toBeLessThan(
      payloadText.indexOf("First message")
    );
  });

  it("quotes safe rich HTML and carries referenced CID images as inline attachments", async () => {
    const inlineImage = {
      id: "attachment-1",
      messageId: "message-1",
      filename: "logo.png",
      contentType: "image/png",
      sizeBytes: 3,
      contentId: "<logo@example.com>",
      disposition: "inline" as const,
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
        r2Key: "sent/2026-07-10/html-1-1"
      })
    );
    expect(put).toHaveBeenCalledWith("sent/2026-07-10/html-1-1", expect.any(ArrayBuffer), {
      httpMetadata: { contentType: "image/png" }
    });
  });
});
