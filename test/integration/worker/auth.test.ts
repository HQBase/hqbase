import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import { createAuth } from "../../../worker/auth/auth";

const origin = "https://hqbase.test";

describe("Better Auth schema", () => {
  beforeAll(async () => {
    await applyMigration(initialMigration);
    await applyMigration(workspaceMigration);

    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
         VALUES ('usr_legacy', 'Legacy Owner', 'legacy@example.com', 1, ?, ?, 'owner', 0)`
      ).bind(now, now),
      env.DB.prepare(
        `INSERT INTO account
         (id, accountId, providerId, userId, password, createdAt, updatedAt)
         VALUES ('acc_legacy', 'usr_legacy', 'credential', 'usr_legacy', 'legacy-hash', ?, ?)`
      ).bind(now, now)
    ]);

    await applyMigration(oauthResourcesMigration);
  });

  it("backfills the Better Auth 1.7 account identity without losing credential rows", async () => {
    const account = await env.DB.prepare(
      `SELECT issuer, providerAccountId, providerId, userId, password
       FROM account
       WHERE id = 'acc_legacy'`
    ).first<{
      issuer: string;
      providerAccountId: string;
      providerId: string;
      userId: string;
      password: string;
    }>();

    expect(account).toEqual({
      issuer: "local:credential",
      providerAccountId: "usr_legacy",
      providerId: "credential",
      userId: "usr_legacy",
      password: "legacy-hash"
    });
  });

  it("creates and signs in a fresh email/password account after migration", async () => {
    const email = "fresh-owner@example.com";
    const password = "correct-horse-battery-staple";
    const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));

    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email,
          name: "Fresh Owner",
          password,
          rememberMe: false
        }),
        headers: {
          "content-type": "application/json",
          origin
        },
        method: "POST"
      })
    );
    expect(signUp.status, await signUp.text()).toBe(200);

    const signIn = await createAuth(env, new Request(`${origin}/api/auth/sign-in/email`)).handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        body: JSON.stringify({ email, password, rememberMe: false }),
        headers: {
          "content-type": "application/json",
          origin
        },
        method: "POST"
      })
    );
    expect(signIn.status, await signIn.text()).toBe(200);
  });
});

async function applyMigration(source: string): Promise<void> {
  for (const statement of source
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}
