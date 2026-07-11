import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import proMigration from "../../../migrations/0002_pro_mail_bridge.sql?raw";
import bridgeV2Migration from "../../../migrations/0003_mail_bridge_v2.sql?raw";
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

beforeAll(async () => {
  await applyMigration(initialMigration);
  await applyMigration(proMigration);
  await applyMigration(bridgeV2Migration);
});

beforeEach(async () => {
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

  it("pages metadata, streams raw MIME, and replays cursor changes", async () => {
    const hash = await appPasswordHash(password, "integration-app-password-pepper");
    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO pro_app_passwords
       (id, user_id, name, secret_hash, created_at, last_used_at, expires_at, revoked_at)
       VALUES (?, ?, 'V2 client', ?, ?, NULL, NULL, NULL)`
    )
      .bind(appPasswordId, userId, hash, timestamp)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_v2', 'owner-v2@example.com', 'Owner V2', 1, ?, ?)`
    )
      .bind(timestamp, timestamp)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_v2', 'production bridge', ?, ?, ?)`
    )
      .bind(timestamp, timestamp, timestamp)
      .run();
    const raw =
      "From: sender@example.com\r\nTo: owner@example.com\r\nSubject: Production bridge\r\n\r\nHello\r\n";
    await env.MAIL_OBJECTS.put("test/v2.eml", raw);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO messages
       (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
        subject, snippet, text_body, html_r2_key, raw_r2_key, message_id, dedupe_key,
        in_reply_to, references_json, received_at, sent_at, read_at, starred_at, archived_at,
        trashed_at, has_attachments, created_at, updated_at)
       VALUES ('msg_v2', 'thr_v2', 'mbx_v2', 'inbound', 'inbox', 'sender@example.com',
        '["owner@example.com"]', '[]', '[]', 'Production bridge', 'Hello', 'Hello', NULL,
        'test/v2.eml', '<v2@example.com>', 'v2-dedupe', NULL, '[]', ?, NULL, NULL, NULL,
        NULL, NULL, 0, ?, ?)`
    )
      .bind(timestamp, timestamp, timestamp)
      .run();

    const authResponse = await SELF.fetch(
      "https://hqbase.test/api/pro/mail-bridge/v2/authenticate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer integration-bridge-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ username: "owner@example.com", password })
      }
    );
    expect(authResponse.status).toBe(200);
    const auth = await authResponse.json<{
      accessToken: string;
      cursor: string;
      mailboxes: Array<{ id: string; name: string }>;
    }>();
    expect(auth.cursor).toMatch(/^v2\./);
    const inbox = auth.mailboxes.find((mailbox) => mailbox.name === "INBOX");
    expect(inbox).toBeDefined();
    const headers = {
      authorization: "Bearer integration-bridge-token",
      "x-hqbase-mail-session": auth.accessToken
    };
    const pageResponse = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/mailboxes/${inbox?.id}/messages?limit=10`,
      { headers }
    );
    expect(pageResponse.status).toBe(200);
    const page = await pageResponse.json<{ messages: Array<{ uid: number; size: number }> }>();
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.size).toBe(raw.length);
    const uid = page.messages[0]?.uid;
    const rawResponse = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/mailboxes/${inbox?.id}/messages/${uid}/raw`,
      { headers: { ...headers, range: "bytes=0-3" } }
    );
    expect(rawResponse.status).toBe(206);
    await expect(rawResponse.text()).resolves.toBe("From");

    await env.DB.prepare("UPDATE messages SET read_at = ?, updated_at = ? WHERE id = 'msg_v2'")
      .bind(timestamp, timestamp)
      .run();
    await env.DB.prepare(
      "INSERT INTO pro_message_changes (message_id, created_at) VALUES ('msg_v2', ?)"
    )
      .bind(timestamp)
      .run();
    const changesResponse = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/changes?cursor=${encodeURIComponent(auth.cursor)}`,
      { headers }
    );
    expect(changesResponse.status).toBe(200);
    const changes = await changesResponse.json<{
      events: Array<{ kind: string; uid: number; flags: string[] }>;
      cursor: string;
    }>();
    expect(changes.events).toContainEqual(
      expect.objectContaining({ kind: "flags", uid, flags: ["\\Seen"] })
    );
    const replay = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/changes?cursor=${encodeURIComponent(auth.cursor)}`,
      { headers }
    );
    await expect(replay.json()).resolves.toMatchObject({ events: changes.events });

    const mutate = (body: Record<string, unknown>) =>
      SELF.fetch("https://hqbase.test/api/pro/mail-bridge/v2/mutations", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    const copyResponse = await mutate({
      idempotencyKey: "integration-copy-0001",
      operation: "copy",
      mailbox: "INBOX",
      target: String(uid),
      destination: "Archive"
    });
    expect(copyResponse.status).toBe(204);
    const copiedChangesResponse = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/changes?cursor=${encodeURIComponent(changes.cursor)}`,
      { headers }
    );
    const copiedChanges = await copiedChangesResponse.json<{
      events: Array<{ kind: string; mailboxId: string }>;
      cursor: string;
    }>();
    const archive = auth.mailboxes.find((mailbox) => mailbox.name === "Archive");
    expect(copiedChanges.events).toContainEqual(
      expect.objectContaining({ kind: "upsert", mailboxId: archive?.id })
    );

    expect(
      (
        await mutate({
          idempotencyKey: "integration-delete-001",
          operation: "store-flags",
          mailbox: "INBOX",
          target: String(uid),
          flags: ["\\Deleted"]
        })
      ).status
    ).toBe(204);
    expect(
      (
        await mutate({
          idempotencyKey: "integration-expunge-01",
          operation: "expunge",
          mailbox: "INBOX",
          target: String(uid)
        })
      ).status
    ).toBe(204);

    expect(
      (
        await mutate({
          idempotencyKey: "integration-append-001",
          operation: "append",
          mailbox: "Drafts",
          flags: ["\\Draft"],
          raw: btoa(
            "From: owner@example.com\r\nTo: draft@example.com\r\nSubject: Draft\r\n\r\nBody\r\n"
          )
        })
      ).status
    ).toBe(204);
    const draft = auth.mailboxes.find((mailbox) => mailbox.name === "Drafts");
    const draftPageResponse = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/mailboxes/${draft?.id}/messages?limit=10`,
      { headers }
    );
    const draftPage = await draftPageResponse.json<{ messages: Array<{ flags: string[] }> }>();
    expect(draftPage.messages).toHaveLength(1);
    expect(draftPage.messages[0]?.flags).toContain("\\Draft");
  });
});
