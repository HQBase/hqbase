import {
  fallbackRaw,
  flagsFor,
  mailboxDefinitions
} from "@worker/features/mail-bridge/sync-format";
import { describe, expect, it } from "vitest";

describe("IMAP synchronization formatting", () => {
  it("defines stable standard mailboxes and shared flags", () => {
    expect(mailboxDefinitions.map((mailbox) => mailbox.name)).toEqual([
      "INBOX",
      "Sent",
      "Drafts",
      "Archive",
      "Trash",
      "Catch-all"
    ]);
    expect(flagsFor({ folder: "drafts", read_at: "now", starred_at: "now" })).toEqual([
      "\\Seen",
      "\\Flagged",
      "\\Draft"
    ]);
  });

  it("constructs a deterministic MIME fallback without an R2 object", () => {
    const raw = fallbackRaw({
      id: "msg_1",
      folder: "inbox",
      read_at: null,
      starred_at: null,
      created_at: "now",
      received_at: "now",
      sent_at: null,
      raw_r2_key: null,
      from_address: "sender@example.com",
      to_json: '["support@example.com"]',
      subject: "Fallback",
      text_body: "Hello",
      message_id: null
    });
    expect(new TextDecoder().decode(raw)).toContain("Message-ID: <msg_1@hqbase.local>");
  });
});
