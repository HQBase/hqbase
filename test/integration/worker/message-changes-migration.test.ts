import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import threadRebuildMigration from "../../../migrations/0005_rebuild_threads.sql?raw";
import pushMigration from "../../../migrations/0006_push_notifications.sql?raw";
import userMailPreferencesMigration from "../../../migrations/0007_user_mail_preferences.sql?raw";
import userOnboardingMigration from "../../../migrations/0008_user_onboarding.sql?raw";
import loginEmailDomainMigration from "../../../migrations/0009_login_email_domain_isolation.sql?raw";
import deviceAuthorizationMigration from "../../../migrations/0010_oauth_device_authorization.sql?raw";
import latestPasswordResetTokenMigration from "../../../migrations/0011_latest_password_reset_token.sql?raw";
import messageActivityIndexMigration from "../../../migrations/0012_message_activity_index.sql?raw";
import messageChangesMigration from "../../../migrations/0013_message_changes.sql?raw";
import { migrationStatements } from "./migration-statements";

const priorMigrations = [
  initialMigration,
  workspaceMigration,
  oauthResourcesMigration,
  conversationMigration,
  threadRebuildMigration,
  pushMigration,
  userMailPreferencesMigration,
  userOnboardingMigration,
  loginEmailDomainMigration,
  deviceAuthorizationMigration,
  latestPasswordResetTokenMigration,
  messageActivityIndexMigration
];

describe("message changes migration", () => {
  beforeAll(async () => {
    for (const migration of priorMigrations) await applyMigration(migration);
    const stamp = "2026-08-17T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_changes_migration', 'changes@example.com', 'Changes', 1, ?, ?)`
      ).bind(stamp, stamp),
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES ('thr_changes_migration', 'changes', ?, ?, ?)`
      ).bind(stamp, stamp, stamp),
      messageRow("msg_before_migration", stamp)
    ]);
    await applyMigration(messageChangesMigration);
  });

  it("upgrades without creating false history for existing messages", async () => {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM message_changes").first<{
      count: number;
    }>();
    expect(count?.count).toBe(0);
  });

  it("journals inserts, updates, and durable deletion tombstones in sequence order", async () => {
    const stamp = "2026-08-17T00:00:01.000Z";
    await messageRow("msg_after_migration", stamp).run();
    await env.DB.prepare(
      "UPDATE messages SET read_at = ?, updated_at = ? WHERE id = 'msg_after_migration'"
    )
      .bind(stamp, stamp)
      .run();
    await env.DB.prepare("DELETE FROM messages WHERE id = 'msg_after_migration'").run();

    const rows = await env.DB.prepare(
      `SELECT sequence, message_id, mailbox_id, kind
       FROM message_changes ORDER BY sequence`
    ).all<{ sequence: number; message_id: string; mailbox_id: string; kind: string }>();
    expect(rows.results).toEqual([
      {
        sequence: 1,
        message_id: "msg_after_migration",
        mailbox_id: "mbx_changes_migration",
        kind: "upsert"
      },
      {
        sequence: 2,
        message_id: "msg_after_migration",
        mailbox_id: "mbx_changes_migration",
        kind: "upsert"
      },
      {
        sequence: 3,
        message_id: "msg_after_migration",
        mailbox_id: "mbx_changes_migration",
        kind: "delete"
      }
    ]);
  });

  it("is safe to re-apply without installing duplicate triggers", async () => {
    await applyMigration(messageChangesMigration);
    await messageRow("msg_after_reapply", "2026-08-17T00:00:02.000Z").run();

    const rows = await env.DB.prepare(
      "SELECT kind FROM message_changes WHERE message_id = 'msg_after_reapply'"
    ).all<{ kind: string }>();
    expect(rows.results).toEqual([{ kind: "upsert" }]);
  });
});

function messageRow(id: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
      received_at, sent_at, read_at, has_attachments, created_at, updated_at)
     VALUES (?, 'thr_changes_migration', 'mbx_changes_migration', 'inbound', 'inbox',
             'sender@example.net', '[]', '[]', '[]', ?, '', '', NULL, ?, NULL, '[]', ?, NULL,
             NULL, 0, ?, ?)`
  ).bind(id, id, `dedupe-${id}`, stamp, stamp, stamp);
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
