import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import threadRebuildMigration from "../../../migrations/0005_rebuild_threads.sql?raw";
import userMailPreferencesMigration from "../../../migrations/0007_user_mail_preferences.sql?raw";
import userOnboardingMigration from "../../../migrations/0008_user_onboarding.sql?raw";
import loginEmailDomainMigration from "../../../migrations/0009_login_email_domain_isolation.sql?raw";
import { createAuth } from "../../../worker/auth/auth";
import { migrationStatements } from "./migration-statements";

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
      ).bind(now, now),
      env.DB.prepare(
        `INSERT INTO mail_domains (id, name, created_at, updated_at)
         VALUES ('dom_legacy', 'example.com', ?, ?)`
      ).bind(now, now)
    ]);

    await applyMigration(oauthResourcesMigration);
    await applyMigration(conversationMigration);
    await applyMigration(threadRebuildMigration);
    await applyMigration(userMailPreferencesMigration);
    await applyMigration(userOnboardingMigration);
    await applyMigration(loginEmailDomainMigration);
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

  it("preserves an existing owner on a managed domain while installing future guards", async () => {
    const legacy = await env.DB.prepare(
      `SELECT u.email, d.name AS domain
       FROM "user" u
       JOIN mail_domains d ON d.name = substr(u.email, instr(u.email, '@') + 1)
       WHERE u.id = 'usr_legacy'`
    ).first<{ email: string; domain: string }>();
    expect(legacy).toEqual({ email: "legacy@example.com", domain: "example.com" });

    const triggers = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name LIKE '%login_email%'`
    ).all<{ name: string }>();
    expect(triggers.results.map((trigger) => trigger.name).sort()).toEqual([
      "mail_domain_login_email_insert_guard",
      "mail_domain_login_email_update_guard",
      "user_login_email_domain_insert_guard",
      "user_login_email_domain_update_guard"
    ]);
  });

  it("applies the conversation draft migration on an existing schema", async () => {
    const columns = await env.DB.prepare("PRAGMA table_info(drafts)").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toContain("forward_of_message_id");
  });

  it("adds per-user default From preferences without changing existing users", async () => {
    const columns = await env.DB.prepare("PRAGMA table_info(user_mail_preferences)").all<{
      name: string;
    }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "user_id",
      "default_from_mailbox_id",
      "created_at",
      "updated_at"
    ]);
    await expect(
      env.DB.prepare(
        `SELECT default_from_mailbox_id
           FROM user_mail_preferences
           WHERE user_id = 'usr_legacy'`
      ).first()
    ).resolves.toBeNull();
  });

  it("keeps existing users active when member onboarding is added", async () => {
    const onboarding = await env.DB.prepare(
      "SELECT status FROM user_onboarding WHERE user_id = 'usr_legacy'"
    ).first();
    expect(onboarding).toBeNull();
  });

  it("stores and returns the signed-in user's default From mailbox", async () => {
    const email = "preference-owner@login.example";
    const password = "correct-horse-battery-staple";
    const signUp = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email,
          name: "Preference Owner",
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
    const cookie = extractSessionCookie(signUp);
    const user = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
      .bind(email)
      .first<{ id: string }>();
    expect(user).not.toBeNull();
    const timestamp = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains (id, name, created_at, updated_at)
         VALUES ('domain_preferences', 'preferences.example', ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mailbox_preferences', 'support@preferences.example', 'Support', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailbox_addresses
         (id, mailbox_id, mail_domain_id, local_part, address, display_name,
          receive_enabled, send_enabled, is_primary, created_at, updated_at)
         VALUES
         ('address_preferences', 'mailbox_preferences', 'domain_preferences', 'support',
          'support@preferences.example', 'Support', 1, 1, 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
         VALUES ('mailbox_preferences', ?, 'agent', ?, ?, ?)`
      ).bind(user?.id, user?.id, timestamp, timestamp)
    ]);

    const updated = await SELF.fetch(`${origin}/api/me`, {
      body: JSON.stringify({ defaultFromMailboxId: "mailbox_preferences" }),
      headers: {
        "content-type": "application/json",
        cookie
      },
      method: "PATCH"
    });
    expect(updated.status, await updated.clone().text()).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      email,
      defaultFromMailboxId: "mailbox_preferences"
    });

    const current = await SELF.fetch(`${origin}/api/me`, { headers: { cookie } });
    expect(current.status, await current.clone().text()).toBe(200);
    await expect(current.json()).resolves.toMatchObject({
      email,
      defaultFromMailboxId: "mailbox_preferences"
    });
  });

  it("creates and signs in a fresh email/password account after migration", async () => {
    const email = "fresh-owner@login.example";
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
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
