import { planInboundStorage } from "@worker/email/inbound-plan";
import type { ParsedEmail } from "@worker/email/parse-email";
import { hasDownloadableAttachments } from "@worker/email/store-email";
import { describe, expect, it } from "vitest";

const parsed: ParsedEmail = {
  attachments: [],
  bcc: [],
  cc: [],
  date: "2026-06-24T14:00:00.000Z",
  fromAddress: "alice@example.net",
  fromName: "Alice Example",
  htmlBody: null,
  inReplyTo: null,
  messageId: "<message@example.net>",
  references: [],
  snippet: "Hello",
  subject: "Hello",
  textBody: "Hello",
  to: []
};

describe("planInboundStorage", () => {
  it("stores known recipients in inbox", () => {
    const plan = planInboundStorage({
      envelopeRecipient: "Support@Example.com",
      mailboxId: "mbx_1",
      parsed
    });

    expect(plan.folder).toBe("inbox");
    expect(plan.mailboxId).toBe("mbx_1");
    expect(plan.to).toEqual(["support@example.com"]);
    expect(plan.dedupeKey).toBe("<message@example.net>:support@example.com");
  });

  it("stores unknown recipients in catchall", () => {
    const plan = planInboundStorage({
      envelopeRecipient: "unknown@example.com",
      mailboxId: null,
      parsed: { ...parsed, messageId: null }
    });

    expect(plan.folder).toBe("catchall");
    expect(plan.mailboxId).toBeNull();
    expect(plan.dedupeKey).toBeNull();
  });

  it("does not count inline MIME images as downloadable attachments", () => {
    const attachment = {
      filename: "logo.png",
      contentType: "image/png",
      contentId: "logo@example.com",
      content: new Uint8Array([1, 2, 3]).buffer
    };

    expect(hasDownloadableAttachments([{ ...attachment, disposition: "inline" }])).toBe(false);
    expect(hasDownloadableAttachments([{ ...attachment, disposition: "attachment" }])).toBe(true);
    expect(
      hasDownloadableAttachments([{ ...attachment, contentId: null, disposition: null }])
    ).toBe(true);
  });
});
