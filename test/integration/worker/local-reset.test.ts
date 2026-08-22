import { env, SELF } from "cloudflare:test";
import { hashPassword } from "better-auth/crypto";
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
import resetSql from "../../../scripts/hqbase/reset-d1.sql?raw";
import { buildSeedSql } from "../../../scripts/local-seed-fixture.mjs";
import { migrationStatements } from "./migration-statements";

const origin = "https://hqbase.test";
const migrations = [
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
  unassignedMessagesMigration,
  personalAccessTokensMigration
];

describe("local database reset", () => {
  beforeAll(async () => {
    await applyMigrations();
    await applyStatements(
      buildSeedSql(await hashPassword("local-seed-password"), new Date("2026-08-14T18:00:00.000Z"))
    );
  }, 60_000);

  it("removes current data and supports a fresh migration", async () => {
    await env.DB.prepare(
      `INSERT INTO personal_access_tokens
       (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
       VALUES (
         'pat_before_local_reset', 'usr_local_owner', 'Reset fixture', ?, 'a1B2',
         '2026-08-14T18:00:00.000Z', NULL, NULL
       )`
    )
      .bind("R".repeat(43))
      .run();

    await applyStatements(resetSql);
    await applyMigrations();

    const setup = await SELF.fetch(`${origin}/api/setup/status`);
    await expect(setup.json()).resolves.toMatchObject({
      isComplete: false,
      userCount: 0,
      mailboxCount: 0
    });

    const oauthTables = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN (
           'oauthResource', 'oauthClientResource', 'oauthClientAssertion', 'user_onboarding',
           'deviceCode'
         )`
    ).first<{ count: number }>();
    expect(oauthTables?.count).toBe(5);

    const resetTokenTrigger = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name = 'verification_latest_password_reset_token'`
    ).first<{ name: string }>();
    expect(resetTokenTrigger?.name).toBe("verification_latest_password_reset_token");

    const activityIndexes = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index'
         AND name IN (
           'messages_activity_idx', 'messages_mailbox_activity_idx', 'messages_folder_activity_idx'
         )
       ORDER BY name`
    ).all<{ name: string }>();
    expect(activityIndexes.results.map((row) => row.name)).toEqual([
      "messages_activity_idx",
      "messages_folder_activity_idx",
      "messages_mailbox_activity_idx"
    ]);

    const changeJournal = await env.DB.prepare(
      `SELECT type, name FROM sqlite_master
       WHERE name = 'message_changes' OR name LIKE 'message_changes_after_%'
       ORDER BY type, name`
    ).all<{ type: string; name: string }>();
    expect(changeJournal.results).toEqual([
      { type: "table", name: "message_changes" },
      { type: "trigger", name: "message_changes_after_delete" },
      { type: "trigger", name: "message_changes_after_insert" },
      { type: "trigger", name: "message_changes_after_update" }
    ]);

    const messageColumns = await env.DB.prepare("PRAGMA table_info(messages)").all<{
      name: string;
    }>();
    expect(messageColumns.results.map((column) => column.name)).toContain("is_unassigned");

    const personalAccessTokens = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM personal_access_tokens"
    ).first<{ count: number }>();
    expect(personalAccessTokens?.count).toBe(0);

    const stamp = "2026-08-20T18:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES ('usr_after_local_reset', 'Reset Owner', 'reset@example.com', 1, ?, ?, 'owner', 0)`
    )
      .bind(stamp, stamp)
      .run();
    await env.DB.prepare(
      `INSERT INTO personal_access_tokens
       (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
       VALUES (
         'pat_after_local_reset', 'usr_after_local_reset', 'Fresh reset token', ?, 'c3D4',
         ?, NULL, NULL
       )`
    )
      .bind("S".repeat(43), stamp)
      .run();

    const freshPat = await env.DB.prepare(
      "SELECT id FROM personal_access_tokens WHERE id = 'pat_after_local_reset'"
    ).first<{ id: string }>();
    expect(freshPat?.id).toBe("pat_after_local_reset");
  });
});

async function applyMigrations(): Promise<void> {
  for (const migration of migrations) {
    await applyStatements(migration);
  }
}

async function applyStatements(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
