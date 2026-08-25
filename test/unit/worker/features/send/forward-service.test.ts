import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/features/drafts/queries", () => ({
  addDraftAttachment: vi.fn(),
  deleteDraft: vi.fn(),
  removeDraftAttachment: vi.fn(),
  saveDraft: vi.fn()
}));
vi.mock("@worker/features/mailboxes/queries", () => ({
  findMailboxForSending: vi.fn()
}));
vi.mock("@worker/features/messages/queries", () => ({
  getMessageDetail: vi.fn()
}));
vi.mock("@worker/features/send/service", () => ({
  sendNewMessage: vi.fn()
}));

import {
  addDraftAttachment,
  deleteDraft,
  removeDraftAttachment,
  saveDraft
} from "@worker/features/drafts/queries";
import { findMailboxForSending } from "@worker/features/mailboxes/queries";
import { getMessageDetail } from "@worker/features/messages/queries";
import { forwardMessage, sendForwardDraft } from "@worker/features/send/forward";
import { sendNewMessage } from "@worker/features/send/service";
import type { WorkerEnv } from "@worker/lib/env";

const original = {
  id: "message-1",
  threadId: "thread-1",
  mailboxId: "mailbox-1",
  direction: "inbound" as const,
  folder: "inbox" as const,
  fromAddress: "sender@example.com",
  fromName: "Sender",
  to: ["support@example.com"],
  cc: [],
  bcc: [],
  subject: "Original",
  snippet: "Original body",
  textBody: "Original body",
  receivedAt: "2026-07-29T12:00:00.000Z",
  sentAt: null,
  readAt: null,
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-07-29T12:00:00.000Z",
  deliveredToAddress: "support@example.com",
  htmlAvailable: false,
  messageId: "<message-1@example.com>",
  inReplyTo: null,
  references: [],
  attachments: []
};
const mailbox = {
  id: "mailbox-1",
  address: "support@example.com",
  deletedAt: null,
  displayName: "Support",
  kind: "human" as const,
  isActive: true,
  mailDomainId: "domain-1",
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:00:00.000Z"
};
const sent = {
  id: "message-forwarded",
  threadId: "thread-forwarded",
  mailboxId: mailbox.id,
  direction: "outbound" as const,
  folder: "sent" as const,
  fromAddress: mailbox.address,
  fromName: mailbox.displayName,
  to: ["recipient@example.com"],
  subject: "Fwd: Original",
  snippet: "Forwarded",
  receivedAt: null,
  sentAt: "2026-07-29T12:01:00.000Z",
  readAt: "2026-07-29T12:01:00.000Z",
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-07-29T12:01:00.000Z"
};

describe("forward service", () => {
  const get = vi.fn();
  const put = vi.fn();
  const env = {
    DB: {} as D1Database,
    MAIL_OBJECTS: { get, put } as unknown as R2Bucket
  } as WorkerEnv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getMessageDetail).mockResolvedValue(original);
    vi.mocked(findMailboxForSending).mockResolvedValue(mailbox);
    vi.mocked(sendNewMessage).mockResolvedValue(sent);
  });

  it("sends server-owned forwarded context as a new message", async () => {
    await expect(
      forwardMessage(
        env,
        {
          messageId: original.id,
          from: mailbox.address,
          to: ["recipient@example.com"],
          cc: [],
          bcc: [],
          text: "Please review",
          attachmentIds: [],
          includeOriginalAttachments: true
        },
        "user-1"
      )
    ).resolves.toEqual(sent);

    expect(sendNewMessage).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        attachmentIds: [],
        from: mailbox.address,
        subject: "Fwd: Original",
        text: "Please review",
        to: ["recipient@example.com"]
      }),
      "user-1",
      undefined,
      expect.objectContaining({
        text: expect.stringContaining("---------- Forwarded message ---------")
      })
    );
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("does not copy inline message images as forwarded attachments", async () => {
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...original,
      attachments: [
        {
          id: "inline-logo",
          messageId: original.id,
          filename: "logo.png",
          contentType: "image/png",
          sizeBytes: 4,
          contentId: "logo@example.com",
          r2Key: "mail/logo.png",
          createdAt: original.createdAt
        }
      ]
    });

    await forwardMessage(
      env,
      {
        messageId: original.id,
        from: mailbox.address,
        to: ["recipient@example.com"],
        cc: [],
        bcc: [],
        text: "Please review",
        attachmentIds: [],
        includeOriginalAttachments: true
      },
      "user-1"
    );

    expect(saveDraft).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(sendNewMessage).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ attachmentIds: [] }),
      "user-1",
      undefined,
      expect.any(Object)
    );
  });

  it("rejects a disabled mailbox before creating an attachment draft", async () => {
    vi.mocked(findMailboxForSending).mockResolvedValue({ ...mailbox, isActive: false });
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...original,
      attachments: [
        {
          id: "attachment-1",
          messageId: original.id,
          filename: "original.txt",
          contentType: "text/plain",
          sizeBytes: 8,
          contentId: null,
          r2Key: "mail/original.txt",
          createdAt: original.createdAt
        }
      ],
      hasAttachments: true
    });

    await expect(
      forwardMessage(
        env,
        {
          messageId: original.id,
          from: mailbox.address,
          to: ["recipient@example.com"],
          cc: [],
          bcc: [],
          text: "",
          attachmentIds: [],
          includeOriginalAttachments: true
        },
        "user-1"
      )
    ).rejects.toMatchObject({ code: "MAILBOX_DISABLED", status: 400 });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(sendNewMessage).not.toHaveBeenCalled();
  });

  it("copies original attachments through a temporary draft before sending", async () => {
    const attachment = {
      id: "attachment-1",
      messageId: original.id,
      filename: "original.txt",
      contentType: "text/plain",
      sizeBytes: 8,
      contentId: null,
      r2Key: "mail/original.txt",
      createdAt: original.createdAt
    };
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...original,
      attachments: [attachment],
      hasAttachments: true
    });
    vi.mocked(saveDraft).mockResolvedValue({
      id: "draft-forward",
      mailboxId: mailbox.id,
      replyToMessageId: null,
      forwardOfMessageId: original.id,
      from: mailbox.address,
      to: ["recipient@example.com"],
      cc: [],
      bcc: [],
      subject: "Fwd: Original",
      text: "Forwarded",
      html: "<blockquote>Forwarded</blockquote>",
      signature: { mode: "none", id: null, name: "", html: "", text: "" },
      version: 1,
      updatedAt: original.createdAt,
      attachments: []
    });
    get.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode("original").buffer
    });
    vi.mocked(addDraftAttachment).mockResolvedValue({
      attachment: {
        id: "attachment-copy",
        filename: "original.txt",
        contentType: "text/plain",
        sizeBytes: 8
      },
      r2Key: "drafts/user-1/draft-forward/attachment-copy"
    });

    await forwardMessage(
      env,
      {
        messageId: original.id,
        from: mailbox.address,
        to: ["recipient@example.com"],
        cc: [],
        bcc: [],
        text: "",
        attachmentIds: [],
        includeOriginalAttachments: true
      },
      "user-1"
    );

    expect(put).toHaveBeenCalledWith(
      "drafts/user-1/draft-forward/attachment-copy",
      expect.any(ReadableStream),
      { httpMetadata: { contentType: "text/plain" } }
    );
    expect(sendNewMessage).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        attachmentIds: ["attachment-copy"],
        draftId: "draft-forward"
      }),
      "user-1",
      undefined,
      expect.objectContaining({
        text: expect.stringContaining("---------- Forwarded message ---------")
      })
    );
    expect(deleteDraft).not.toHaveBeenCalled();
  });

  it("adds original attachments when the web UI sends a forward draft", async () => {
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...original,
      attachments: [
        {
          id: "attachment-1",
          messageId: original.id,
          filename: "original.txt",
          contentType: "text/plain",
          sizeBytes: 8,
          contentId: null,
          r2Key: "mail/original.txt",
          createdAt: original.createdAt
        }
      ],
      hasAttachments: true
    });
    get.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode("original").buffer
    });
    vi.mocked(addDraftAttachment).mockResolvedValue({
      attachment: {
        id: "attachment-copy",
        filename: "original.txt",
        contentType: "text/plain",
        sizeBytes: 8
      },
      r2Key: "drafts/user-1/draft-web/attachment-copy"
    });

    await sendForwardDraft(
      env,
      {
        from: mailbox.address,
        to: ["recipient@example.com"],
        cc: [],
        bcc: [],
        subject: "Fwd: Original",
        text: "Authored quote\n\n---------- Forwarded message ---------",
        html: "<blockquote>Authored quote</blockquote><blockquote>Forwarded message</blockquote>",
        attachmentIds: ["attachment-added"],
        draftId: "draft-web"
      },
      "draft-web",
      original.id,
      "user-1"
    );

    expect(sendNewMessage).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        attachmentIds: ["attachment-added", "attachment-copy"],
        draftId: "draft-web",
        text: "Authored quote",
        html: "<blockquote>Authored quote</blockquote>"
      }),
      "user-1",
      undefined,
      expect.objectContaining({
        text: expect.stringContaining("---------- Forwarded message ---------")
      })
    );
    expect(saveDraft).not.toHaveBeenCalled();
    expect(removeDraftAttachment).not.toHaveBeenCalled();
  });

  it("removes copied attachments when a web forward draft is not sent", async () => {
    vi.mocked(getMessageDetail).mockResolvedValue({
      ...original,
      attachments: [
        {
          id: "attachment-1",
          messageId: original.id,
          filename: "original.txt",
          contentType: "text/plain",
          sizeBytes: 8,
          contentId: null,
          r2Key: "mail/original.txt",
          createdAt: original.createdAt
        }
      ],
      hasAttachments: true
    });
    get.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode("original").buffer
    });
    vi.mocked(addDraftAttachment).mockResolvedValue({
      attachment: {
        id: "attachment-copy",
        filename: "original.txt",
        contentType: "text/plain",
        sizeBytes: 8
      },
      r2Key: "drafts/user-1/draft-web/attachment-copy"
    });
    vi.mocked(sendNewMessage).mockRejectedValueOnce(new Error("Delivery failed."));

    await expect(
      sendForwardDraft(
        env,
        {
          from: mailbox.address,
          to: ["recipient@example.com"],
          cc: [],
          bcc: [],
          subject: "Fwd: Original",
          text: "---------- Forwarded message ---------",
          attachmentIds: [],
          draftId: "draft-web"
        },
        "draft-web",
        original.id,
        "user-1"
      )
    ).rejects.toThrow("Delivery failed.");

    expect(removeDraftAttachment).toHaveBeenCalledWith(
      env.DB,
      env.MAIL_OBJECTS,
      "user-1",
      "draft-web",
      "attachment-copy"
    );
  });
});
