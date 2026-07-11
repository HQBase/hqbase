import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import proMigration from "../../../migrations/0002_pro_mail_bridge.sql?raw";
import bridgeV2Migration from "../../../migrations/0003_mail_bridge_v2.sql?raw";
import track1Migration from "../../../migrations/0004_track1_operations.sql?raw";
import multiDomainMigration from "../../../migrations/0005_multi_domain.sql?raw";
import composerMigration from "../../../migrations/0006_composer.sql?raw";
import billingMigration from "../../../migrations/0007_billing.sql?raw";
import { appPasswordHash } from "../../../worker/features/app-passwords/crypto";
import {
  insertAppPassword,
  listAppPasswords,
  revokeAppPassword,
  verifyAppPassword
} from "../../../worker/features/app-passwords/queries";
import { getEntitlementRow } from "../../../worker/features/billing/queries";
import { activateWorkspace } from "../../../worker/features/billing/service";
import { upsertMailDomain } from "../../../worker/features/domains/queries";
import { getDraft, saveDraft } from "../../../worker/features/drafts/queries";
import {
  revokeMailboxGrant,
  setMailboxGrant
} from "../../../worker/features/mailbox-access/queries";
import {
  findMailboxByAddress,
  findMailboxForSending,
  insertMailboxAddress
} from "../../../worker/features/mailboxes/queries";
import { processJob } from "../../../worker/jobs/consumer";
import type { WorkerEnv } from "../../../worker/lib/env";

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
  const timestamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES (?, 'Owner', 'owner@example.com', 1, ?, ?, 'owner', 0)`
    ).bind(userId, timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES ('usr_existing', 'Existing', 'existing@example.com', 1, ?, ?, 'member', 0)`
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_existing', 'existing@example.com', 'Existing', 1, ?, ?)`
    ).bind(timestamp, timestamp)
  ]);
  await applyMigration(track1Migration);
  await applyMigration(multiDomainMigration);
  await applyMigration(composerMigration);
  await applyMigration(billingMigration);
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
    await expect(
      env.DB.prepare(
        "SELECT access_level FROM pro_mailbox_grants WHERE user_id = 'usr_existing' AND mailbox_id = 'mbx_existing'"
      ).first()
    ).resolves.toMatchObject({ access_level: "agent" });
  });
});

describe("billing entitlement lifecycle", () => {
  it("activates a license through the vendor service and stores only encrypted key material", async () => {
    const checkedAt = new Date().toISOString();
    const status = await activateWorkspace(
      env,
      { licenseKey: "HQB_INTEGRATION_LICENSE", hostname: "mail.example.com" },
      async () =>
        Response.json({
          state: "active",
          canConfigure: true,
          activationId: "00000000-0000-4000-8000-000000000010",
          displayKey: "HQB_••••CENSE",
          currentPeriodEnd: "2026-08-11T00:00:00.000Z",
          checkedAt
        })
    );
    expect(status).toMatchObject({ state: "active", canConfigure: true });
    const row = await getEntitlementRow(env.DB);
    expect(row?.encrypted_license_key).toBeTruthy();
    expect(row?.encrypted_license_key).not.toContain("HQB_INTEGRATION_LICENSE");
  });

  it("prefers a same-account service binding over the public billing origin", async () => {
    const requests: Request[] = [];
    const boundEnv = {
      ...env,
      BILLING: {
        fetch: async (request: Request) => {
          requests.push(request);
          return Response.json({
            state: "active",
            canConfigure: true,
            activationId: "00000000-0000-4000-8000-000000000011",
            displayKey: "HQB_••••BOUND",
            currentPeriodEnd: "2026-08-11T00:00:00.000Z",
            checkedAt: new Date().toISOString()
          });
        }
      } as Fetcher
    } as WorkerEnv;

    await activateWorkspace(
      boundEnv,
      { licenseKey: "HQB_SERVICE_BINDING", hostname: "staging.example.com" },
      async () => {
        throw new Error("public fetch must not be used");
      }
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://billing.internal/v1/entitlements/activate");
  });
});

describe("multi-domain mailbox identities", () => {
  it("routes an alias to one mailbox while enforcing its send switch", async () => {
    const domain = await upsertMailDomain(env.DB, {
      name: "second.example",
      receivingStatus: "ready",
      sendingStatus: "ready",
      dnsStatus: "ready"
    });
    const alias = await insertMailboxAddress(env.DB, "mbx_existing", domain.id, {
      address: "support@second.example",
      displayName: "Support alias",
      sendEnabled: false
    });
    await expect(findMailboxByAddress(env.DB, alias.address)).resolves.toMatchObject({
      id: "mbx_existing"
    });
    await expect(findMailboxForSending(env.DB, alias.address)).resolves.toBeNull();
  });
});

describe("durable composer drafts", () => {
  it("persists drafts and rejects stale concurrent updates", async () => {
    const created = await saveDraft(env.DB, userId, {
      mailboxId: "mbx_existing",
      replyToMessageId: null,
      from: "existing@example.com",
      to: ["recipient@example.net"],
      cc: [],
      bcc: [],
      subject: "Saved subject",
      text: "Saved body",
      html: "<p>Saved body</p>"
    });
    const updated = await saveDraft(env.DB, userId, {
      ...created,
      subject: "Updated subject"
    });
    await expect(getDraft(env.DB, userId, created.id)).resolves.toMatchObject({
      subject: "Updated subject",
      version: updated.version
    });
    await expect(
      saveDraft(env.DB, userId, { ...created, subject: "Stale update" })
    ).rejects.toMatchObject({ code: "DRAFT_CONFLICT", status: 409 });
  });
});

describe("mail bridge authentication", () => {
  it("reports deep bridge readiness", async () => {
    const response = await SELF.fetch("https://hqbase.test/api/pro/mail-bridge/v2/ready", {
      headers: { authorization: "Bearer integration-bridge-token" }
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ready: true,
      checks: { database: true, schema: true, entitlement: true, storage: true }
    });
  });

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

    const response = await SELF.fetch("https://hqbase.test/api/pro/mail-bridge/v2/authenticate", {
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
      mailboxes: { name: string }[];
    }>();
    expect(body.accessToken).toMatch(/^mss_/);
    expect(body.allowedFrom).toContain("owner@example.com");
    expect(body.mailboxes.map((mailbox) => mailbox.name)).toEqual([
      "INBOX",
      "Sent",
      "Drafts",
      "Archive",
      "Trash",
      "Catch-all"
    ]);
  });

  it("limits a read-only member to the granted mailbox across bridge reads and mutations", async () => {
    const timestamp = new Date().toISOString();
    const kirillId = "usr_kirill";
    const kirillPasswordId = "apw_00000000-0000-4000-8000-000000000099";
    const kirillPassword = `hqp_${kirillPasswordId}.${"K".repeat(32)}`;
    const kirillHash = await appPasswordHash(kirillPassword, "integration-app-password-pepper");
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR REPLACE INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
         VALUES (?, 'Kirill', 'kirill@example.com', 1, ?, ?, 'member', 0)`
      ).bind(kirillId, timestamp, timestamp),
      env.DB.prepare(
        `INSERT OR REPLACE INTO pro_app_passwords
         (id, user_id, name, secret_hash, created_at, last_used_at, expires_at, revoked_at)
         VALUES (?, ?, 'Kirill client', ?, ?, NULL, NULL, NULL)`
      ).bind(kirillPasswordId, kirillId, kirillHash, timestamp),
      env.DB.prepare(
        `INSERT OR REPLACE INTO mailboxes
         (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_support', 'support@example.com', 'Support', 1, ?, ?),
                ('mbx_privacy', 'privacy@example.com', 'Privacy', 1, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(
        `INSERT OR REPLACE INTO threads
         (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES ('thr_support', 'support', ?, ?, ?), ('thr_privacy', 'privacy', ?, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(
        `INSERT OR REPLACE INTO messages
         (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
          subject, snippet, text_body, references_json, received_at, has_attachments, created_at, updated_at)
         VALUES ('msg_support', 'thr_support', 'mbx_support', 'inbound', 'inbox', 'a@example.com',
          '["support@example.com"]', '[]', '[]', 'Support', 'one', 'one', '[]', ?, 0, ?, ?),
          ('msg_privacy', 'thr_privacy', 'mbx_privacy', 'inbound', 'inbox', 'b@example.com',
          '["privacy@example.com"]', '[]', '[]', 'Privacy', 'two', 'two', '[]', ?, 0, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp)
    ]);
    await setMailboxGrant(env.DB, "mbx_support", kirillId, "read", userId);

    const authResponse = await SELF.fetch(
      "https://hqbase.test/api/pro/mail-bridge/v2/authenticate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer integration-bridge-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ username: "kirill@example.com", password: kirillPassword })
      }
    );
    expect(authResponse.status).toBe(200);
    const auth = await authResponse.json<{
      accessToken: string;
      allowedFrom: string[];
      mailboxes: Array<{ id: string; name: string }>;
    }>();
    expect(auth.allowedFrom).toEqual([]);
    const inbox = auth.mailboxes.find((mailbox) => mailbox.name === "INBOX");
    const headers = {
      authorization: "Bearer integration-bridge-token",
      "x-hqbase-mail-session": auth.accessToken
    };
    const page = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/mailboxes/${inbox?.id}/messages?limit=10`,
      { headers }
    );
    const listed = await page.json<{ messages: Array<{ uid: number }> }>();
    expect(listed.messages).toHaveLength(1);
    const mutation = await SELF.fetch("https://hqbase.test/api/pro/mail-bridge/v2/mutations", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "kirill-read-only-mutation",
        operation: "store-flags",
        mailbox: "INBOX",
        target: String(listed.messages[0]?.uid),
        flags: ["\\Seen"]
      })
    });
    expect(mutation.status).toBe(403);

    expect(await revokeMailboxGrant(env.DB, "mbx_support", kirillId)).toBe(true);
    const staleSession = await SELF.fetch(
      `https://hqbase.test/api/pro/mail-bridge/v2/mailboxes/${inbox?.id}/messages?limit=10`,
      { headers }
    );
    expect(staleSession.status).toBe(401);
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
    const target = page.messages.find((message) => message.size === raw.length);
    expect(target).toBeDefined();
    const uid = target?.uid;
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

describe("Track 1 operations", () => {
  it("runs maintenance idempotently and records content-free counters", async () => {
    const job = {
      id: "maintenance:integration",
      kind: "maintenance" as const,
      requestedAt: new Date().toISOString()
    };
    await processJob(env, job);
    await processJob(env, job);
    const rows = await env.DB.prepare(
      "SELECT status, counters_json FROM pro_operation_runs WHERE id = ?"
    )
      .bind(job.id)
      .all<{ status: string; counters_json: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.status).toBe("succeeded");
    expect(JSON.parse(rows.results[0]?.counters_json ?? "{}")).toHaveProperty("sessions");
  });
});
