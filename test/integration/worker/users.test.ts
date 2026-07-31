import { env, SELF } from "cloudflare:test";
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
import { createAuth } from "../../../worker/auth/auth";
import { migrationStatements } from "./migration-statements";

const origin = "https://hqbase.test";
let ownerCookie = "";

describe("workspace user onboarding", () => {
  beforeAll(async () => {
    for (const migration of [
      initialMigration,
      workspaceMigration,
      oauthResourcesMigration,
      conversationMigration,
      threadRebuildMigration,
      pushMigration,
      userMailPreferencesMigration,
      userOnboardingMigration,
      loginEmailDomainMigration
    ]) {
      await applyMigration(migration);
    }

    const owner = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "owner@login.example",
          name: "Workspace Owner",
          password: "owner-password-123",
          rememberMe: false
        }),
        headers: { "content-type": "application/json", origin },
        method: "POST"
      })
    );
    expect(owner.status, await owner.clone().text()).toBe(200);
    ownerCookie = extractSessionCookie(owner);
    await env.DB.prepare(
      `UPDATE "user" SET role = 'owner' WHERE email = 'owner@login.example'`
    ).run();

    const timestamp = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('domain_users', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mailbox_users', 'support@example.com', 'Support', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailbox_addresses
         (id, mailbox_id, mail_domain_id, local_part, address, display_name,
          receive_enabled, send_enabled, is_primary, created_at, updated_at)
         VALUES ('address_users', 'mailbox_users', 'domain_users', 'support',
                 'support@example.com', 'Support', 1, 1, 1, ?, ?)`
      ).bind(timestamp, timestamp)
    ]);
  });

  it("generates a temporary password and denies workspace APIs until it is replaced", async () => {
    const created = await createUser({
      email: "direct-user@gmail.com",
      method: "temporary_password",
      name: "Direct User",
      role: "member"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const result = (await created.json()) as {
      temporaryPassword: string;
      user: { id: string; passwordSetupRequired: boolean };
    };
    expect(result.temporaryPassword).toMatch(/^Hq![A-Za-z0-9_-]{24}$/);
    expect(result.user.passwordSetupRequired).toBe(true);

    const account = await env.DB.prepare(
      "SELECT password FROM account WHERE userId = ? AND providerId = 'credential'"
    )
      .bind(result.user.id)
      .first<{ password: string }>();
    expect(account?.password).not.toBe(result.temporaryPassword);

    const memberCookie = await signIn("direct-user@gmail.com", result.temporaryPassword);
    const meBefore = await SELF.fetch(`${origin}/api/me`, { headers: { cookie: memberCookie } });
    await expect(meBefore.json()).resolves.toMatchObject({ passwordSetupRequired: true });

    const blocked = await SELF.fetch(`${origin}/api/mailboxes`, {
      headers: { cookie: memberCookie }
    });
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({
      error: { code: "PASSWORD_SETUP_REQUIRED" }
    });

    const changed = await SELF.fetch(`${origin}/api/me/password`, {
      body: JSON.stringify({
        confirmPassword: "member-chosen-password-456",
        currentPassword: result.temporaryPassword,
        newPassword: "member-chosen-password-456"
      }),
      headers: { "content-type": "application/json", cookie: memberCookie, origin },
      method: "POST"
    });
    expect(changed.status, await changed.clone().text()).toBe(200);
    const refreshedCookie = extractSessionCookie(changed);

    const meAfter = await SELF.fetch(`${origin}/api/me`, { headers: { cookie: refreshedCookie } });
    await expect(meAfter.json()).resolves.toMatchObject({ passwordSetupRequired: false });
    const allowed = await SELF.fetch(`${origin}/api/mailboxes`, {
      headers: { cookie: refreshedCookie }
    });
    expect(allowed.status, await allowed.clone().text()).toBe(200);
  });

  it("keeps Login email domains separate from workspace email domains in both directions", async () => {
    const managedLogin = await createUser({
      email: "person@example.com",
      method: "temporary_password",
      name: "Managed Domain User",
      role: "member"
    });
    expect(managedLogin.status).toBe(409);
    await expect(managedLogin.json()).resolves.toMatchObject({
      error: { code: "LOGIN_EMAIL_DOMAIN_MANAGED" }
    });
    const rejectedUser = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
      .bind("person@example.com")
      .first();
    expect(rejectedUser).toBeNull();

    const futureDomainUser = await createUser({
      email: "person@future.example",
      method: "temporary_password",
      name: "Future Domain User",
      role: "member"
    });
    expect(futureDomainUser.status, await futureDomainUser.clone().text()).toBe(201);

    const domain = await SELF.fetch(`${origin}/api/domains`, {
      body: JSON.stringify({ name: "future.example" }),
      headers: { "content-type": "application/json", cookie: ownerCookie, origin },
      method: "POST"
    });
    expect(domain.status).toBe(409);
    await expect(domain.json()).resolves.toMatchObject({
      error: { code: "DOMAIN_USED_BY_LOGIN_EMAIL" }
    });
    const rejectedDomain = await env.DB.prepare("SELECT id FROM mail_domains WHERE name = ?")
      .bind("future.example")
      .first();
    expect(rejectedDomain).toBeNull();
  });

  it("regenerates a lost temporary password only while setup is pending", async () => {
    const created = await createUser({
      email: "regenerated-user@gmail.com",
      method: "temporary_password",
      name: "Regenerated User",
      role: "member"
    });
    const initial = (await created.json()) as {
      temporaryPassword: string;
      user: { id: string };
    };

    const regenerated = await SELF.fetch(
      `${origin}/api/users/${initial.user.id}/temporary-password`,
      { headers: { cookie: ownerCookie }, method: "POST" }
    );
    expect(regenerated.status, await regenerated.clone().text()).toBe(200);
    const next = (await regenerated.json()) as { temporaryPassword: string };
    expect(next.temporaryPassword).not.toBe(initial.temporaryPassword);

    await expect(signIn("regenerated-user@gmail.com", initial.temporaryPassword)).rejects.toThrow();
    await expect(signIn("regenerated-user@gmail.com", next.temporaryPassword)).resolves.toContain(
      "better-auth.session_token"
    );
  });

  it("creates a passwordless invite and activates it through the single-use setup token", async () => {
    const created = await createUser({
      email: "invited-user@gmail.com",
      method: "email_invite",
      name: "Invited User",
      role: "member"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const result = (await created.json()) as {
      temporaryPassword?: string;
      user: { id: string; invitationSentAt: string | null; passwordSetupRequired: boolean };
    };
    expect(result.temporaryPassword).toBeUndefined();
    expect(result.user.invitationSentAt).not.toBeNull();
    expect(result.user.passwordSetupRequired).toBe(true);

    const credential = await env.DB.prepare(
      "SELECT id FROM account WHERE userId = ? AND providerId = 'credential'"
    )
      .bind(result.user.id)
      .first();
    expect(credential).toBeNull();

    const verification = await env.DB.prepare(
      `SELECT identifier, expiresAt FROM verification
       WHERE value = ? AND identifier LIKE 'reset-password:%'`
    )
      .bind(result.user.id)
      .first<{ identifier: string; expiresAt: string }>();
    const firstToken = verification?.identifier.replace("reset-password:", "");
    expect(firstToken).toBeTruthy();
    const invitationLifetimeMs = new Date(verification?.expiresAt ?? 0).getTime() - Date.now();
    expect(invitationLifetimeMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(invitationLifetimeMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);

    const resent = await SELF.fetch(`${origin}/api/users/${result.user.id}/resend-invitation`, {
      headers: { cookie: ownerCookie },
      method: "POST"
    });
    expect(resent.status, await resent.clone().text()).toBe(200);
    const latestVerification = await env.DB.prepare(
      `SELECT identifier FROM verification
       WHERE value = ? AND identifier LIKE 'reset-password:%'`
    )
      .bind(result.user.id)
      .first<{ identifier: string }>();
    const token = latestVerification?.identifier.replace("reset-password:", "");
    expect(token).toBeTruthy();
    expect(token).not.toBe(firstToken);

    const invalidated = await SELF.fetch(`${origin}/api/auth/reset-password`, {
      body: JSON.stringify({
        newPassword: "invalidated-invite-password",
        token: firstToken
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    });
    expect(invalidated.status).toBe(400);

    const accepted = await SELF.fetch(`${origin}/api/auth/reset-password`, {
      body: JSON.stringify({ newPassword: "invited-user-password-789", token }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);

    const onboarding = await env.DB.prepare(
      "SELECT status, completed_at FROM user_onboarding WHERE user_id = ?"
    )
      .bind(result.user.id)
      .first<{ status: string; completed_at: string | null }>();
    expect(onboarding?.status).toBe("complete");
    expect(onboarding?.completed_at).not.toBeNull();
    const audit = await env.DB.prepare(
      `SELECT outcome FROM audit_events
       WHERE action = 'user.password.setup' AND resource_id = ?`
    )
      .bind(result.user.id)
      .first<{ outcome: string }>();
    expect(audit?.outcome).toBe("success");
    await expect(signIn("invited-user@gmail.com", "invited-user-password-789")).resolves.toContain(
      "better-auth.session_token"
    );

    const replay = await SELF.fetch(`${origin}/api/auth/reset-password`, {
      body: JSON.stringify({ newPassword: "replayed-password-000", token }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    });
    expect(replay.status).toBe(400);
  });
});

function createUser(input: {
  email: string;
  method: "email_invite" | "temporary_password";
  name: string;
  role: "member";
}): Promise<Response> {
  return SELF.fetch(`${origin}/api/users`, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json", cookie: ownerCookie, origin },
    method: "POST"
  });
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await SELF.fetch(`${origin}/api/auth/sign-in/email`, {
    body: JSON.stringify({ email, password, rememberMe: false }),
    headers: { "content-type": "application/json", origin },
    method: "POST"
  });
  if (!response.ok) throw new Error(await response.text());
  return extractSessionCookie(response);
}

function extractSessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
