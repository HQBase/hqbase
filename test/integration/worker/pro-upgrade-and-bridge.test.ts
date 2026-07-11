import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import proMigration from "../../../migrations/0002_pro_mail_bridge.sql?raw";
import { appPasswordHash } from "../../../worker/features/app-passwords/crypto";
import {
  insertAppPassword,
  listAppPasswords,
  revokeAppPassword,
  verifyAppPassword
} from "../../../worker/features/app-passwords/queries";

const userId = "usr_integration";
const appPasswordId = "apw_00000000-0000-4000-8000-000000000001";
const password = `hqp_${appPasswordId}.${"A".repeat(32)}`;

async function applyMigration(source: string) {
  for (const statement of source
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

beforeEach(async () => {
  await applyMigration(initialMigration);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO "user"
     (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
     VALUES (?, 'Owner', 'owner@example.com', 1, ?, ?, 'owner', 0)`
  )
    .bind(userId, new Date().toISOString(), new Date().toISOString())
    .run();
});

describe("Community to Pro migration", () => {
  it("retains Community rows and creates the Pro schema", async () => {
    await applyMigration(proMigration);
    await expect(
      env.DB.prepare('SELECT email FROM "user" WHERE id = ?').bind(userId).first()
    ).resolves.toMatchObject({
      email: "owner@example.com"
    });
    await expect(
      env.DB.prepare("SELECT value FROM pro_schema_state WHERE key = 'edition'").first()
    ).resolves.toMatchObject({
      value: "pro"
    });
  });
});

describe("mail bridge authentication", () => {
  it("creates, verifies, lists, and revokes a one-time app password", async () => {
    await applyMigration(proMigration);
    const created = await insertAppPassword(
      env.DB,
      userId,
      "Headless client",
      "integration-pepper"
    );
    expect(created.password).toMatch(/^hqp_/);
    expect(await listAppPasswords(env.DB, userId)).toHaveLength(1);
    await expect(
      verifyAppPassword(env.DB, "owner@example.com", created.password, "integration-pepper")
    ).resolves.toMatchObject({ userId });
    await expect(revokeAppPassword(env.DB, userId, created.appPassword.id)).resolves.toBe(true);
    await expect(
      verifyAppPassword(env.DB, "owner@example.com", created.password, "integration-pepper")
    ).resolves.toBeNull();
  });

  it("authenticates an app password and returns stable standard mailboxes", async () => {
    await applyMigration(proMigration);
    const hash = await appPasswordHash(password, "integration-app-password-pepper");
    await env.DB.prepare(
      `INSERT INTO pro_app_passwords
       (id, user_id, name, secret_hash, created_at, last_used_at, expires_at, revoked_at)
       VALUES (?, ?, 'Test client', ?, ?, NULL, NULL, NULL)`
    )
      .bind(appPasswordId, userId, hash, new Date().toISOString())
      .run();
    await env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_test', 'owner@example.com', 'Owner', 1, ?, ?)`
    )
      .bind(new Date().toISOString(), new Date().toISOString())
      .run();

    const response = await SELF.fetch("https://hqbase.test/api/pro/mail-bridge/v1/authenticate", {
      method: "POST",
      headers: {
        authorization: "Bearer integration-bridge-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ username: "owner@example.com", password })
    });
    expect(response.status).toBe(200);
    const body = await response.json<{
      accessToken: string;
      allowedFrom: string[];
      snapshot: { mailboxes: { name: string }[] };
    }>();
    expect(body.accessToken).toMatch(/^mss_/);
    expect(body.allowedFrom).toEqual(["owner@example.com"]);
    expect(body.snapshot.mailboxes.map((mailbox) => mailbox.name)).toEqual([
      "INBOX",
      "Sent",
      "Drafts",
      "Archive",
      "Trash",
      "Catch-all"
    ]);
  });
});
