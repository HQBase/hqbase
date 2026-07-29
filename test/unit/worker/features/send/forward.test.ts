import { forwardedBody } from "@worker/features/send/forward";
import { describe, expect, it } from "vitest";

describe("forwarded mail body", () => {
  it("builds visible server-owned text and escaped HTML context", () => {
    const body = forwardedBody(
      {
        id: "message-1",
        threadId: "thread-1",
        mailboxId: "mailbox-1",
        direction: "inbound",
        folder: "inbox",
        fromAddress: "sender@example.com",
        to: ["support@example.com"],
        cc: ["manager@example.com"],
        bcc: [],
        subject: "Status <script>",
        snippet: "Original",
        textBody: "Original <script>alert(1)</script>",
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
      },
      "Please review",
      "<p><strong>Please review</strong></p>"
    );

    expect(body.text).toContain("Please review\n\n---------- Forwarded message ---------");
    expect(body.text).toContain("From: sender@example.com");
    expect(body.html).toContain("<p><strong>Please review</strong></p>");
    expect(body.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body.html).not.toContain("<script>");
  });
});
