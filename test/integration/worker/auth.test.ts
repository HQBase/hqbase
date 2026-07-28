import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import threadRebuildMigration from "../../../migrations/0005_rebuild_threads.sql?raw";
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
    await applyMigration(conversationMigration);
    await applyMigration(threadRebuildMigration);
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

  it("applies the conversation draft migration on an existing schema", async () => {
    const columns = await env.DB.prepare("PRAGMA table_info(drafts)").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toContain("forward_of_message_id");
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
    const staleSessionCookie = extractSessionCookie(signIn);

    const recent = await SELF.fetch(`${origin}/api/sessions/recent-authentication`, {
      headers: { cookie: staleSessionCookie }
    });
    expect(await recent.json()).toEqual({ recent: true });

    await env.DB.prepare(
      `UPDATE "session"
       SET createdAt = ?
       WHERE userId = (SELECT id FROM "user" WHERE email = ?)`
    )
      .bind(new Date(0).toISOString(), email)
      .run();

    const stale = await SELF.fetch(`${origin}/api/sessions/recent-authentication`, {
      headers: { cookie: staleSessionCookie }
    });
    expect(await stale.json()).toEqual({ recent: false });

    const rejected = await SELF.fetch(`${origin}/api/sessions/reauthenticate`, {
      body: JSON.stringify({ password: "incorrect-password" }),
      headers: {
        "cf-connecting-ip": "192.0.2.1",
        "content-type": "application/json",
        cookie: staleSessionCookie,
        origin
      },
      method: "POST"
    });
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({
      error: {
        code: "REAUTHENTICATION_FAILED",
        message: "The password is incorrect. Try again."
      }
    });

    const reauthenticated = await SELF.fetch(`${origin}/api/sessions/reauthenticate`, {
      body: JSON.stringify({ password }),
      headers: {
        "cf-connecting-ip": "192.0.2.1",
        "content-type": "application/json",
        cookie: staleSessionCookie,
        origin
      },
      method: "POST"
    });
    expect(reauthenticated.status, await reauthenticated.text()).toBe(200);
    const recentSessionCookie = extractSessionCookie(reauthenticated);

    const refreshed = await SELF.fetch(`${origin}/api/sessions/recent-authentication`, {
      headers: { cookie: recentSessionCookie }
    });
    expect(await refreshed.json()).toEqual({ recent: true });

    const audits = await env.DB.prepare(
      `SELECT outcome
       FROM audit_events
       WHERE action = 'session.reauthenticate'
       ORDER BY occurred_at, id`
    ).all<{ outcome: string }>();
    expect(audits.results.map(({ outcome }) => outcome).sort()).toEqual(["denied", "success"]);
  });
});

function extractSessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) {
    throw new Error("Better Auth session cookie was not returned.");
  }
  return match[1];
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of source
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}
