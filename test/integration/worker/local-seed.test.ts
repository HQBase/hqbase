import { env, SELF } from "cloudflare:test";
import { hashPassword } from "better-auth/crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { buildSeedSql } from "../../../scripts/local-seed-fixture.mjs";
import { applyCurrentMigrations } from "./current-migrations";
import { migrationStatements } from "./migration-statements";

const origin = "https://hqbase.test";
const password = "local-seed-password";

describe("local database seed fixture", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    await applyStatements(
      buildSeedSql(await hashPassword(password), new Date("2026-08-14T18:00:00.000Z"))
    );
  }, 60_000);

  it("creates a complete workspace with representative records", async () => {
    const setup = await SELF.fetch(`${origin}/api/setup/status`);
    await expect(setup.json()).resolves.toMatchObject({
      isComplete: true,
      primaryDomain: "example.test",
      userCount: 4,
      mailboxCount: 6
    });

    const counts = await env.DB.prepare(
      `SELECT
          (SELECT COUNT(*) FROM threads) AS threads,
          (SELECT COUNT(*) FROM messages) AS messages,
          (SELECT COUNT(*) FROM drafts) AS drafts,
          (SELECT COUNT(*) FROM mailbox_addresses) AS addresses,
          (SELECT COUNT(*) FROM principals) AS principals,
          (SELECT value_json FROM app_settings WHERE key = 'local_seed_version') AS seed_version`
    ).first<{
      threads: number;
      messages: number;
      drafts: number;
      addresses: number;
      principals: number;
      seed_version: string;
    }>();
    expect(counts).toEqual({
      threads: 116,
      messages: 123,
      drafts: 4,
      addresses: 8,
      principals: 4,
      seed_version: '"local-demo-v3"'
    });

    const deliveries = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM messages
       WHERE direction = 'inbound' AND delivered_to_address_id IS NOT NULL`
    ).first<{ count: number }>();
    expect(deliveries?.count).toBe(118);
  });

  it("is repeatable without duplicating fixture records", async () => {
    await applyStatements(
      buildSeedSql(await hashPassword(password), new Date("2026-08-14T19:00:00.000Z"))
    );
    const counts = await env.DB.prepare(
      `SELECT
          (SELECT COUNT(*) FROM "user" WHERE id = 'usr_local_owner') AS users,
          (SELECT COUNT(*) FROM messages WHERE id LIKE 'msg_local_%') AS messages,
          (SELECT COUNT(*) FROM drafts WHERE id LIKE 'drf_local_%') AS drafts`
    ).first<{ users: number; messages: number; drafts: number }>();
    expect(counts).toEqual({ users: 1, messages: 123, drafts: 4 });
  });

  it("creates credentials that Better Auth can use for a normal session", async () => {
    const response = await SELF.fetch(`${origin}/api/auth/sign-in/email`, {
      body: JSON.stringify({
        email: "owner@hqbase.test",
        password,
        rememberMe: false
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    });
    expect(response.status, await response.clone().text()).toBe(200);

    const currentUser = await SELF.fetch(`${origin}/api/me`, {
      headers: { cookie: extractSessionCookie(response) }
    });
    await expect(currentUser.json()).resolves.toMatchObject({
      email: "owner@hqbase.test",
      role: "owner",
      passwordSetupRequired: false
    });
  });
});

async function applyStatements(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}

function extractSessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Better Auth session cookie was not returned.");
  return match[1];
}
