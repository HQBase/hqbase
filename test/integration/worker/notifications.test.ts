import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import threadRebuildMigration from "../../../migrations/0005_rebuild_threads.sql?raw";
import pushMigration from "../../../migrations/0006_push_notifications.sql?raw";
import userOnboardingMigration from "../../../migrations/0008_user_onboarding.sql?raw";
import loginEmailDomainMigration from "../../../migrations/0009_login_email_domain_isolation.sql?raw";
import { createAuth } from "../../../worker/auth/auth";
import {
  countUnreadMessages,
  listPushSubscriptionsForMailbox,
  removePushSubscription,
  savePushSubscription
} from "../../../worker/features/notifications/queries";
import { migrationStatements } from "./migration-statements";

describe("notification persistence", () => {
  beforeAll(async () => {
    for (const migration of [
      initialMigration,
      workspaceMigration,
      oauthResourcesMigration,
      conversationMigration,
      threadRebuildMigration,
      pushMigration,
      userOnboardingMigration,
      loginEmailDomainMigration
    ]) {
      await applyMigration(migration);
    }
    const now = "2026-07-29T12:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
         VALUES
           ('usr_owner', 'Owner', 'owner@login.example', 1, ?, ?, 'owner', 0),
           ('usr_member', 'Member', 'member@login.example', 1, ?, ?, 'member', 0),
           ('usr_other', 'Other', 'other@login.example', 1, ?, ?, 'member', 0),
           ('usr_banned', 'Banned', 'banned@login.example', 1, ?, ?, 'owner', 1)`
      ).bind(now, now, now, now, now, now, now, now),
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES
           ('mbx_one', 'support@example.com', 'Support', 1, ?, ?),
           ('mbx_two', 'privacy@example.com', 'Privacy', 1, ?, ?)`
      ).bind(now, now, now, now),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
         VALUES ('mbx_one', 'usr_member', 'read', 'usr_owner', ?, ?)`
      ).bind(now, now),
      env.DB.prepare(
        `INSERT INTO threads
         (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES ('thr_push', 'push', ?, ?, ?)`
      ).bind(now, now, now)
    ]);
    await insertMessage("msg_inbox", "mbx_one", "inbox", null);
    await insertMessage("msg_catchall", "mbx_one", "catchall", null);
    await insertMessage("msg_read", "mbx_one", "inbox", now);
    await insertMessage("msg_z_other", "mbx_two", "inbox", null);

    for (const [userId, endpoint] of [
      ["usr_owner", "https://push.example/owner"],
      ["usr_member", "https://push.example/member"],
      ["usr_other", "https://push.example/other"],
      ["usr_banned", "https://push.example/banned"]
    ] as const) {
      await savePushSubscription(env.DB, userId, subscription(endpoint));
    }
  });

  it("counts only accessible unread attention folders", async () => {
    await expect(countUnreadMessages(env.DB, ["mbx_one"])).resolves.toEqual({
      catchall: 1,
      inbox: 1,
      inboxByMailbox: { mbx_one: 1 },
      total: 2
    });
    await expect(countUnreadMessages(env.DB, ["mbx_one", "mbx_two"])).resolves.toEqual({
      catchall: 1,
      inbox: 2,
      inboxByMailbox: { mbx_one: 1, mbx_two: 1 },
      total: 3
    });
  });

  it("targets owners and live mailbox grants but not unrelated or banned users", async () => {
    const subscriptions = await listPushSubscriptionsForMailbox(env.DB, "mbx_one");
    expect(subscriptions.map((row) => row.user_id).sort()).toEqual(["usr_member", "usr_owner"]);
  });

  it("moves an endpoint to the current signed-in user and scopes removal by ownership", async () => {
    const endpoint = "https://push.example/shared-device";
    await savePushSubscription(env.DB, "usr_owner", subscription(endpoint));
    await savePushSubscription(env.DB, "usr_member", subscription(endpoint));
    await removePushSubscription(env.DB, "usr_owner", endpoint);
    expect(
      await env.DB.prepare("SELECT user_id FROM push_subscriptions WHERE endpoint = ?")
        .bind(endpoint)
        .first<{ user_id: string }>()
    ).toEqual({ user_id: "usr_member" });
    await removePushSubscription(env.DB, "usr_member", endpoint);
    expect(
      await env.DB.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?")
        .bind(endpoint)
        .first()
    ).toBeNull();
  });

  it("requires an authenticated user and validates subscription endpoints at the API boundary", async () => {
    const origin = "https://hqbase.test";
    const email = "push-user@login.example";
    const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email,
          name: "Push User",
          password: "correct-horse-battery-staple",
          rememberMe: false
        }),
        headers: { "content-type": "application/json", origin },
        method: "POST"
      })
    );
    expect(signUp.status, await signUp.text()).toBe(200);
    const cookie = extractSessionCookie(signUp);
    const user = await env.DB.prepare(`SELECT id FROM "user" WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>();
    expect(user).not.toBeNull();
    await env.DB.prepare(
      `INSERT INTO mailbox_grants
       (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
       VALUES ('mbx_one', ?, 'read', 'usr_owner', ?, ?)`
    )
      .bind(user?.id, "2026-07-29T12:00:00.000Z", "2026-07-29T12:00:00.000Z")
      .run();

    const unauthenticated = await SELF.fetch(`${origin}/api/notifications/status`);
    expect(unauthenticated.status).toBe(401);
    const status = await SELF.fetch(`${origin}/api/notifications/status`, {
      headers: { cookie }
    });
    expect(status.status, await status.clone().text()).toBe(200);
    expect(await status.json()).toEqual({
      latestInboundMessageId: "msg_read",
      unread: { catchall: 1, inbox: 1, inboxByMailbox: { mbx_one: 1 }, total: 2 },
      vapidPublicKey: "integration-vapid-public-key"
    });

    const invalid = await SELF.fetch(`${origin}/api/notifications/subscription`, {
      body: JSON.stringify(subscription("http://push.example/insecure")),
      headers: { "content-type": "application/json", cookie, origin },
      method: "PUT"
    });
    expect(invalid.status).toBe(400);

    const endpoint = "https://push.example/api-device";
    const saved = await SELF.fetch(`${origin}/api/notifications/subscription`, {
      body: JSON.stringify(subscription(endpoint)),
      headers: { "content-type": "application/json", cookie, origin },
      method: "PUT"
    });
    expect(saved.status, await saved.text()).toBe(200);
    expect(
      await env.DB.prepare("SELECT user_id FROM push_subscriptions WHERE endpoint = ?")
        .bind(endpoint)
        .first<{ user_id: string }>()
    ).toEqual({ user_id: user?.id });

    const removed = await SELF.fetch(`${origin}/api/notifications/subscription`, {
      body: JSON.stringify({ endpoint }),
      headers: { "content-type": "application/json", cookie, origin },
      method: "DELETE"
    });
    expect(removed.status, await removed.text()).toBe(200);
  });
});

function subscription(endpoint: string) {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      auth: "auth_key_123456789",
      p256dh: "p256dh_key_123456789"
    }
  };
}

async function insertMessage(
  id: string,
  mailboxId: string,
  folder: "catchall" | "inbox",
  readAt: string | null
): Promise<void> {
  const now = "2026-07-29T12:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO messages (
       id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
       subject, snippet, text_body, references_json, received_at, read_at, has_attachments,
       created_at, updated_at
     ) VALUES (?, 'thr_push', ?, 'inbound', ?, 'sender@example.com', '[]', '[]', '[]',
       'Subject', 'Snippet', 'Body', '[]', ?, ?, 0, ?, ?)`
  )
    .bind(id, mailboxId, folder, now, readAt, now, now)
    .run();
}

async function applyMigration(source: string): Promise<void> {
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
