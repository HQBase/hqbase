import { env, SELF } from "cloudflare:test";
import { hashPassword } from "better-auth/crypto";
import { beforeAll, describe, expect, it } from "vitest";

import resetSql from "../../../scripts/hqbase/reset-d1.sql?raw";
import { buildSeedSql } from "../../../scripts/local-seed-fixture.mjs";
import { applyCurrentMigrations } from "./current-migrations";
import { migrationStatements } from "./migration-statements";

const origin = "https://hqbase.test";
describe("local database reset", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    await applyStatements(
      buildSeedSql(await hashPassword("local-seed-password"), new Date("2026-08-14T18:00:00.000Z"))
    );
  }, 60_000);

  it("removes current data and supports a fresh migration", async () => {
    await applyStatements(resetSql);
    await applyCurrentMigrations();

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

    const agentTables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('principals', 'agents', 'agent_credentials')
       ORDER BY name`
    ).all<{ name: string }>();
    expect(agentTables.results.map((row) => row.name)).toEqual([
      "agent_credentials",
      "agents",
      "principals"
    ]);
  });
});

async function applyStatements(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
