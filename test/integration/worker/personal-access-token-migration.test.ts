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
import personalAccessTokensMigration from "../../../migrations/0015_personal_access_tokens.sql?raw";
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
  messageChangesMigration,
  unassignedMessagesMigration
];

describe("personal access token migration", () => {
  let existingRows: Record<string, Record<string, unknown>[]>;

  beforeAll(async () => {
    for (const migration of priorMigrations) await applyMigration(migration);
    await seedExistingRows();
    existingRows = await loadExistingRows();
    await applyMigration(personalAccessTokensMigration);
  });

  it("adds the PAT table and indexes without changing existing records", async () => {
    expect(await loadExistingRows()).toEqual(existingRows);

    const columns = await env.DB.prepare("PRAGMA table_info(personal_access_tokens)").all<{
      name: string;
    }>();
    expect(columns.results.map(({ name }) => name)).toEqual([
      "id",
      "user_id",
      "name",
      "token_hash",
      "token_suffix",
      "created_at",
      "expires_at",
      "revoked_at"
    ]);

    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'personal_access_tokens_%'"
    ).all<{ name: string }>();
    expect(indexes.results.map(({ name }) => name).sort()).toEqual([
      "personal_access_tokens_list_idx",
      "personal_access_tokens_user_idx"
    ]);
  });
});

async function seedExistingRows(): Promise<void> {
  const stamp = "2026-08-19T18:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES ('usr_pat_migration', 'Migration Owner', 'migration@example.com', 1, ?, ?, 'owner', 0)`
    ).bind(stamp, stamp),
    env.DB.prepare(
      `INSERT INTO oauthClient
       (id, clientId, userId, redirectUris, createdAt, updatedAt)
       VALUES ('oauth_client_row', 'oauth-client-migration', 'usr_pat_migration', '[]', ?, ?)`
    ).bind(stamp, stamp),
    env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_pat_migration', 'migration@example.com', 'Migration', 1, ?, ?)`
    ).bind(stamp, stamp),
    env.DB.prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_pat_migration', 'migration', ?, ?, ?)`
    ).bind(stamp, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO messages (
         id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
         subject, snippet, text_body, references_json, received_at, has_attachments,
         created_at, updated_at
       ) VALUES (
         'msg_pat_migration', 'thr_pat_migration', 'mbx_pat_migration', 'inbound', 'inbox',
         'sender@example.net', '[]', '[]', '[]', 'Migration', '', '', '[]', ?, 0, ?, ?
       )`
    ).bind(stamp, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO audit_events
       (id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
        resource_id, outcome, metadata_json)
       VALUES (
         'audit_pat_migration', ?, 'correlation-migration', 'user', 'usr_pat_migration',
         'migration.fixture', 'message', 'msg_pat_migration', 'success', '{}'
       )`
    ).bind(stamp)
  ]);
}

async function loadExistingRows(): Promise<Record<string, Record<string, unknown>[]>> {
  const tables = ["user", "oauthClient", "mailboxes", "threads", "messages", "audit_events"];
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        const rows = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all<
          Record<string, unknown>
        >();
        return [table, rows.results] as const;
      })
    )
  );
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
