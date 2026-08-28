import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import messageAttachmentDispositionMigration from "../../../migrations/0027_message_attachment_disposition.sql?raw";
import { migrationStatements } from "./migration-statements";

describe("message attachment disposition migration", () => {
  beforeAll(async () => {
    await env.DB.prepare(
      `CREATE TABLE message_attachments (
         id TEXT PRIMARY KEY NOT NULL,
         content_type TEXT NOT NULL,
         content_id TEXT
       )`
    ).run();
    await env.DB.prepare(
      `INSERT INTO message_attachments (id, content_type, content_id)
       VALUES
         ('att_gmail_pdf', 'application/pdf', '<gmail-pdf@example.net>'),
         ('att_gmail_image', 'image/png', '<gmail-image@example.net>'),
         ('att_hqbase_inline', 'image/png', 'inline-image@hqbase.invalid'),
         ('att_plain_file', 'text/plain', NULL)`
    ).run();
    for (const statement of migrationStatements(messageAttachmentDispositionMigration)) {
      await env.DB.prepare(statement).run();
    }
  });

  it("keeps Gmail files downloadable while preserving HQBase inline images", async () => {
    const rows = await env.DB.prepare(
      "SELECT id, disposition FROM message_attachments ORDER BY id"
    ).all<{ disposition: "attachment" | "inline"; id: string }>();

    expect(rows.results).toEqual([
      { disposition: "attachment", id: "att_gmail_image" },
      { disposition: "attachment", id: "att_gmail_pdf" },
      { disposition: "inline", id: "att_hqbase_inline" },
      { disposition: "attachment", id: "att_plain_file" }
    ]);
  });
});
