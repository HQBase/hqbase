import { planInboundStorage } from "@worker/email/inbound-plan";
import type { ParsedEmail } from "@worker/email/parse-email";
import { describe, expect, it } from "vitest";

const parsed: ParsedEmail = {
  attachments: [],
  bcc: [],
  cc: [],
  date: "2026-06-24T14:00:00.000Z",
  fromAddress: "alice@example.net",
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
});
