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
import draftChangesMigration from "../../../migrations/0015_draft_changes.sql?raw";
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

describe("draft changes migration", () => {
  beforeAll(async () => {
    for (const migration of priorMigrations) await applyMigration(migration);
    const stamp = "2026-08-22T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
         VALUES ('usr_draft_migration', 'Draft Migration', 'draft-migration@example.com',
                 1, ?, ?, 'member')`
      ).bind(stamp, stamp),
      draftRow("drf_before_migration", stamp)
    ]);
    await applyMigration(draftChangesMigration);
  });

  it("upgrades without creating false history for existing drafts", async () => {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM draft_changes").first<{
      count: number;
    }>();
    expect(count?.count).toBe(0);
    const indexes = await env.DB.prepare("PRAGMA index_list('drafts')").all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toContain("drafts_user_updated_id_idx");
    expect(indexes.results.map((row) => row.name)).not.toContain("drafts_user_updated_idx");
    const plan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT * FROM drafts
       WHERE user_id = ?
         AND (updated_at < ? OR (updated_at = ? AND id < ?))
       ORDER BY updated_at DESC, id DESC
       LIMIT 101`
    )
      .bind(
        "usr_draft_migration",
        "2026-08-22T00:00:00.000Z",
        "2026-08-22T00:00:00.000Z",
        "drf_before_migration"
      )
      .all<{ detail: string }>();
    expect(plan.results.some((row) => row.detail.includes("drafts_user_updated_id_idx"))).toBe(
      true
    );
    expect(plan.results.some((row) => row.detail.includes("USE TEMP B-TREE"))).toBe(false);
  });

  it("journals draft and attachment changes with a durable deletion tombstone", async () => {
    const stamp = "2026-08-22T00:01:00.000Z";
    await draftRow("drf_after_migration", stamp).run();
    await env.DB.prepare(
      "UPDATE drafts SET subject = 'Changed', version = 2, updated_at = ? WHERE id = ?"
    )
      .bind(stamp, "drf_after_migration")
      .run();
    await env.DB.prepare(
      `INSERT INTO draft_attachments
       (id, draft_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES ('att_draft_migration', 'drf_after_migration', 'note.txt', 'text/plain', 4,
               'drafts/migration/note.txt', ?)`
    )
      .bind(stamp)
      .run();
    await env.DB.prepare("DELETE FROM draft_attachments WHERE id = 'att_draft_migration'").run();
    await env.DB.prepare("DELETE FROM drafts WHERE id = 'drf_after_migration'").run();

    const rows = await env.DB.prepare(
      `SELECT sequence, draft_id, user_id, kind
       FROM draft_changes WHERE draft_id = 'drf_after_migration' ORDER BY sequence`
    ).all<{ sequence: number; draft_id: string; user_id: string; kind: string }>();
    expect(rows.results).toEqual([
      {
        sequence: 1,
        draft_id: "drf_after_migration",
        user_id: "usr_draft_migration",
        kind: "upsert"
      },
      {
        sequence: 2,
        draft_id: "drf_after_migration",
        user_id: "usr_draft_migration",
        kind: "upsert"
      },
      {
        sequence: 3,
        draft_id: "drf_after_migration",
        user_id: "usr_draft_migration",
        kind: "upsert"
      },
      {
        sequence: 4,
        draft_id: "drf_after_migration",
        user_id: "usr_draft_migration",
        kind: "upsert"
      },
      {
        sequence: 5,
        draft_id: "drf_after_migration",
        user_id: "usr_draft_migration",
        kind: "delete"
      }
    ]);
  });

  it("is safe to re-apply without installing duplicate triggers", async () => {
    await applyMigration(draftChangesMigration);
    await draftRow("drf_after_reapply", "2026-08-22T00:02:00.000Z").run();

    const rows = await env.DB.prepare(
      "SELECT kind FROM draft_changes WHERE draft_id = 'drf_after_reapply'"
    ).all<{ kind: string }>();
    expect(rows.results).toEqual([{ kind: "upsert" }]);
  });
});

function draftRow(id: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO drafts
     (id, user_id, mailbox_id, from_address, to_json, cc_json, bcc_json, subject,
      text_body, html_body, created_at, updated_at)
     VALUES (?, 'usr_draft_migration', NULL, '', '[]', '[]', '[]', ?, '', '', ?, ?)`
  ).bind(id, id, stamp, stamp);
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
