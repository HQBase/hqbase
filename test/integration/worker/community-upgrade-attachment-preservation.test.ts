import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import preserveAttachments from "../../../community-upgrade/0000_preserve_message_attachments.sql?raw";
import restoreAttachments from "../../../community-upgrade/9999_restore_message_attachments.sql?raw";
import initialMigration from "../../../migrations/0001_initial.sql?raw";
import bridgeMigration from "../../../migrations/0002_pro_mail_bridge.sql?raw";
import bridgeV2Migration from "../../../migrations/0003_mail_bridge_v2.sql?raw";

async function applyMigration(source: string): Promise<void> {
  for (const statement of source
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  await applyMigration(initialMigration);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mailboxes
       (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mailbox-1', 'owner@example.com', 'Owner', 1, datetime('now'), datetime('now'))`
    ),
    env.DB.prepare(
      `INSERT INTO threads
       (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thread-1', 'preserved', datetime('now'), datetime('now'), datetime('now'))`
    ),
    env.DB.prepare(
      `INSERT INTO messages
       (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json,
        bcc_json, subject, snippet, text_body, references_json, has_attachments,
        created_at, updated_at)
       VALUES ('message-1', 'thread-1', 'mailbox-1', 'inbound', 'inbox',
               'sender@example.com', '["owner@example.com"]', '[]', '[]', 'Preserved',
               'Attachment survives', 'Attachment survives', '[]', 1,
               datetime('now'), datetime('now'))`
    ),
    env.DB.prepare(
      `INSERT INTO message_attachments
       (id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
       VALUES ('attachment-1', 'message-1', 'existing.txt', 'text/plain', 12, NULL,
               'messages/message-1/attachments/existing.txt', datetime('now'))`
    )
  ]);
  await applyMigration(preserveAttachments);
  await applyMigration(bridgeMigration);
  await applyMigration(bridgeV2Migration);
  await applyMigration(restoreAttachments);
});

describe("Community attachment migration", () => {
  it("preserves attachment references across the messages table rebuild", async () => {
    await expect(
      env.DB.prepare(
        "SELECT message_id, filename, r2_key FROM message_attachments WHERE id = 'attachment-1'"
      ).first()
    ).resolves.toEqual({
      message_id: "message-1",
      filename: "existing.txt",
      r2_key: "messages/message-1/attachments/existing.txt"
    });
    await expect(
      env.DB.prepare("SELECT COUNT(*) AS count FROM _hqbase_upgrade_message_attachments").first()
    ).resolves.toEqual({ count: 1 });
  });
});
