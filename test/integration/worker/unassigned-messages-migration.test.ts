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
import unassignedMessagesMigration from "../../../migrations/0014_unassigned_messages.sql?raw";
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
  messageActivityIndexMigration,
  messageChangesMigration
];

describe("unassigned message migration", () => {
  beforeAll(async () => {
    for (const migration of priorMigrations) await applyMigration(migration);
    const stamp = "2026-08-18T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_migration_deleted', 'deleted@example.com', 'Deleted', 1, ?, ?)`
      ).bind(stamp, stamp),
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES
           ('thr_migration_catchall', 'catchall', ?, ?, ?),
           ('thr_migration_orphan', 'orphan', ?, ?, ?)`
      ).bind(stamp, stamp, stamp, stamp, stamp, stamp),
      legacyMessage("msg_migration_catchall", "thr_migration_catchall", null, "catchall", stamp),
      legacyMessage(
        "msg_migration_orphan",
        "thr_migration_orphan",
        "mbx_migration_deleted",
        "inbox",
        stamp
      )
    ]);
    await env.DB.prepare("DELETE FROM mailboxes WHERE id = 'mbx_migration_deleted'").run();
    await applyMigration(unassignedMessagesMigration);
  });

  it("backfills only legacy unassigned catch-all mail", async () => {
    const rows = await env.DB.prepare(
      `SELECT id, mailbox_id, is_unassigned FROM messages
       WHERE id LIKE 'msg_migration_%' ORDER BY id`
    ).all<{ id: string; is_unassigned: number; mailbox_id: string | null }>();
    expect(rows.results).toEqual([
      { id: "msg_migration_catchall", is_unassigned: 1, mailbox_id: null },
      { id: "msg_migration_orphan", is_unassigned: 0, mailbox_id: null }
    ]);
  });

  it("journals the explicit state for upserts and deletion tombstones", async () => {
    const stamp = "2026-08-18T00:01:00.000Z";
    await env.DB.prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_migration_new', 'new catchall', ?, ?, ?)`
    )
      .bind(stamp, stamp, stamp)
      .run();
    await env.DB.prepare(
      `INSERT INTO messages (
         id, thread_id, mailbox_id, is_unassigned, direction, folder, from_address,
         to_json, cc_json, bcc_json, subject, snippet, text_body, references_json,
         received_at, has_attachments, created_at, updated_at
       ) VALUES (
         'msg_migration_new', 'thr_migration_new', NULL, 1, 'inbound', 'catchall',
         'sender@example.net', '[]', '[]', '[]', 'New', '', '', '[]', ?, 0, ?, ?
       )`
    )
      .bind(stamp, stamp, stamp)
      .run();
    await env.DB.prepare("DELETE FROM messages WHERE id = 'msg_migration_new'").run();

    const rows = await env.DB.prepare(
      `SELECT mailbox_id, is_unassigned, kind FROM message_changes
       WHERE message_id = 'msg_migration_new' ORDER BY sequence`
    ).all<{ is_unassigned: number; kind: string; mailbox_id: string | null }>();
    expect(rows.results).toEqual([
      { is_unassigned: 1, kind: "upsert", mailbox_id: null },
      { is_unassigned: 1, kind: "delete", mailbox_id: null }
    ]);
  });
});

function legacyMessage(
  id: string,
  threadId: string,
  mailboxId: string | null,
  folder: "catchall" | "inbox",
  stamp: string
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages (
       id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
       subject, snippet, text_body, references_json, received_at, has_attachments,
       created_at, updated_at
     ) VALUES (?, ?, ?, 'inbound', ?, 'sender@example.net', '[]', '[]', '[]',
       ?, '', '', '[]', ?, 0, ?, ?)`
  ).bind(id, threadId, mailboxId, folder, id, stamp, stamp, stamp);
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
