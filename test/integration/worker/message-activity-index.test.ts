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
  latestPasswordResetTokenMigration
];

const activityAt = "COALESCE(received_at, sent_at, created_at)";
// Literal values keep EXPLAIN QUERY PLAN readable; the planner treats them like bound parameters.
const listSql = `SELECT messages.* FROM messages
  WHERE mailbox_id IN ('mbx_index', 'mbx_other') AND folder = 'inbox'
  ORDER BY ${activityAt} DESC, messages.id DESC LIMIT 101`;
const keysetSql = `SELECT messages.* FROM messages
  WHERE mailbox_id IN ('mbx_index', 'mbx_other') AND folder = 'inbox'
    AND (${activityAt} < '2025-01-01T00:00:30.000Z'
      OR (${activityAt} = '2025-01-01T00:00:30.000Z' AND messages.id < 'msg_idx_0100'))
  ORDER BY ${activityAt} DESC, messages.id DESC LIMIT 101`;
const singleMailboxSql = `SELECT messages.* FROM messages
  WHERE mailbox_id IN ('mbx_index', 'mbx_other') AND mailbox_id = 'mbx_index'
  ORDER BY ${activityAt} DESC, messages.id DESC LIMIT 101`;
// The production default: GET /messages with no folder filter — the route ALWAYS adds
// mailbox_id IN (...) for the readable set. Reviewer-reproduced shape: with two readable
// mailboxes and no folder, the planner kept messages_mailbox_idx + a temp B-tree until
// PRAGMA optimize gave it statistics for the new ordering indexes.
const broadAccessSql = `SELECT messages.* FROM messages
  WHERE mailbox_id IN ('mbx_index', 'mbx_other')
  ORDER BY ${activityAt} DESC, messages.id DESC LIMIT 101`;

describe("message activity index migration", () => {
  beforeAll(async () => {
    for (const migration of priorMigrations) {
      await applyMigration(migration);
    }
    const stamp = "2025-01-01T00:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_index', 'index@example.com', 'Index', 1, ?, ?),
              ('mbx_other', 'other@example.com', 'Other', 1, ?, ?)`
    )
      .bind(stamp, stamp, stamp, stamp)
      .run();
    await env.DB.prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_index', 'index', ?, ?, ?)`
    )
      .bind(stamp, stamp, stamp)
      .run();
    // Both readable mailboxes are populated, so the broad-access shape (no folder,
    // mailbox_id IN (...)) is a genuine multi-mailbox merge, not a single-source scan.
    await env.DB.batch(
      Array.from({ length: 400 }, (_, index) =>
        env.DB.prepare(
          `INSERT INTO messages
           (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
            subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
            received_at, sent_at, read_at, has_attachments, created_at, updated_at)
           VALUES (?, 'thr_index', ?, 'inbound', 'inbox', 'sender@example.net', '[]',
                   '[]', '[]', '', '', '', NULL, ?, NULL, '[]', ?, NULL, NULL, 0, ?, ?)`
        ).bind(
          `msg_idx_${String(index).padStart(4, "0")}`,
          index % 2 === 0 ? "mbx_index" : "mbx_other",
          `idx-dedupe-${index}`,
          `2025-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
          stamp,
          stamp
        )
      )
    );
  });

  it("sorts the message list in a temporary B-tree before the migration", async () => {
    expect(await queryPlan(listSql)).toContain("USE TEMP B-TREE FOR ORDER BY");
  });

  it("serves the list, keyset, single-mailbox, and broad-access orders from an index after the migration", async () => {
    await applyMigration(messageActivityIndexMigration);

    for (const sql of [listSql, keysetSql, singleMailboxSql, broadAccessSql]) {
      expect(await queryPlan(sql), sql).not.toContain("USE TEMP B-TREE FOR ORDER BY");
    }
  });

  it("upgrades an existing database and is safe to re-apply", async () => {
    await applyMigration(messageActivityIndexMigration);
    await applyMigration(messageActivityIndexMigration);

    const rows = await env.DB.prepare("SELECT COUNT(*) AS count FROM messages").first<{
      count: number;
    }>();
    expect(rows?.count).toBe(400);

    const indexes = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'messages_%activity_idx'
       ORDER BY name`
    ).all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toEqual([
      "messages_activity_idx",
      "messages_folder_activity_idx",
      "messages_mailbox_activity_idx"
    ]);
  });
});

async function queryPlan(sql: string): Promise<string> {
  const result = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<{ detail: string }>();
  return result.results.map((row) => row.detail).join("\n");
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
