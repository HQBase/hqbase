import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { encodeChangeCursor } from "../../../worker/features/messages/change-cursor";
import { applyCurrentMigrations } from "./current-migrations";
import { tokenRow } from "./mail-api-token-fixture";

const origin = "https://hqbase.test";
const apiResource = `${origin}/api/v2`;
const readToken = "hqb_access_changes-read-token";
const writeToken = "hqb_access_changes-write-token";
let userId = "";

describe("HQBase Mail API message changes", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "changes-member@login.example",
          name: "Changes Member",
          password: "mail-changes-test-password",
          rememberMe: false
        }),
        headers: { "content-type": "application/json", origin },
        method: "POST"
      })
    );
    expect(signUp.status, await signUp.clone().text()).toBe(200);

    const user = await env.DB.prepare(
      `SELECT u.id, s.id AS sessionId
       FROM "user" u JOIN "session" s ON s.userId = u.id
       WHERE u.email = ? ORDER BY s.createdAt DESC LIMIT 1`
    )
      .bind("changes-member@login.example")
      .first<{ id: string; sessionId: string }>();
    if (!user) throw new Error("Changes API test user was not created.");
    userId = user.id;

    const stamp = "2026-08-17T00:00:00.000Z";
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const tokenRows = await Promise.all([
      tokenRow(
        env.DB,
        "tok_changes_read",
        readToken,
        "client_changes_api",
        user.sessionId,
        user.id,
        future,
        ["mail:read"],
        apiResource
      ),
      tokenRow(
        env.DB,
        "tok_changes_write",
        writeToken,
        "client_changes_api",
        user.sessionId,
        user.id,
        future,
        ["mail:write"],
        apiResource
      )
    ]);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_changes', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(stamp, stamp),
      mailboxRow("mbx_changes", "changes@example.com", stamp),
      mailboxRow("mbx_changes_bulk", "bulk-changes@example.com", stamp),
      mailboxRow("mbx_changes_secret", "secret-changes@example.com", stamp),
      grantRow("mbx_changes", stamp),
      grantRow("mbx_changes_bulk", stamp),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('client_row_changes', 'client_changes_api', 0, ?, 1, 1, ?, ?)`
      ).bind(JSON.stringify(["https://client.example/changes"]), stamp, stamp),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, resources, createdAt, updatedAt)
         VALUES ('consent_changes', 'client_changes_api', ?, ?, ?, ?, ?)`
      ).bind(
        user.id,
        JSON.stringify(["mail:read", "mail:write"]),
        JSON.stringify([apiResource]),
        stamp,
        stamp
      ),
      ...tokenRows,
      threadRow("thr_changes", stamp),
      threadRow("thr_changes_bulk", stamp),
      threadRow("thr_changes_secret", stamp),
      messageRow("msg_changes_initial", "thr_changes", "mbx_changes", stamp)
    ]);
  });

  it("starts with a checkpoint and does not replay historical journal rows", async () => {
    const first = await apiFetch("/api/v2/changes", readToken);
    expect(first.status, await first.clone().text()).toBe(200);
    const checkpoint = await changePage(first);
    expect(checkpoint).toMatchObject({ changes: [], hasMore: false });

    const next = await apiFetch(`/api/v2/changes?cursor=${checkpoint.nextCursor}`, readToken);
    await expect(next.json()).resolves.toMatchObject({ changes: [], hasMore: false });
  });

  it("returns every rapid update and the current public message summary", async () => {
    const cursor = await checkpoint();
    const stamp = "2026-08-17T00:01:00.000Z";
    await messageRow("msg_changes_rapid", "thr_changes", "mbx_changes", stamp).run();
    await env.DB.prepare(
      `UPDATE messages SET read_at = ?, starred_at = ?, updated_at = ?
       WHERE id = 'msg_changes_rapid'`
    )
      .bind(stamp, stamp, stamp)
      .run();
    await env.DB.prepare(
      `UPDATE messages SET folder = 'archived', archived_at = ?, updated_at = ?
       WHERE id = 'msg_changes_rapid'`
    )
      .bind(stamp, stamp)
      .run();

    const response = await apiFetch(`/api/v2/changes?cursor=${cursor}`, readToken);
    const page = await changePage(response);
    expect(page.hasMore).toBe(false);
    expect(page.changes).toHaveLength(3);
    for (const change of page.changes) {
      expect(change).toMatchObject({
        type: "upsert",
        message: {
          id: "msg_changes_rapid",
          mailboxId: "mbx_changes",
          folder: "archived",
          fromName: "Sender Example",
          readAt: stamp,
          starredAt: stamp
        }
      });
      expect(change).not.toHaveProperty("message.raw_r2_key");
      expect(change).not.toHaveProperty("message.html_r2_key");
      expect(change).not.toHaveProperty("message.text_body");
    }
  });

  it("bounds a bulk cycle at its high-water sequence", async () => {
    const stamp = "2026-08-17T00:02:00.000Z";
    await env.DB.batch(
      Array.from({ length: 105 }, (_, index) =>
        messageRow(
          `msg_changes_bulk_${String(index).padStart(3, "0")}`,
          "thr_changes_bulk",
          "mbx_changes_bulk",
          stamp
        )
      )
    );
    const cursor = await checkpoint();
    await env.DB.prepare(
      `UPDATE messages SET read_at = ?, updated_at = ? WHERE mailbox_id = 'mbx_changes_bulk'`
    )
      .bind(stamp, stamp)
      .run();

    const first = await changePage(
      await apiFetch(`/api/v2/changes?cursor=${cursor}&limit=100`, readToken)
    );
    expect(first.changes).toHaveLength(100);
    expect(first.hasMore).toBe(true);

    const laterStamp = "2026-08-17T00:02:01.000Z";
    await env.DB.prepare(
      `UPDATE messages SET starred_at = ?, updated_at = ?
       WHERE id = 'msg_changes_bulk_000'`
    )
      .bind(laterStamp, laterStamp)
      .run();

    const second = await changePage(
      await apiFetch(`/api/v2/changes?cursor=${first.nextCursor}&limit=100`, readToken)
    );
    expect(second.changes).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    const cycleIds = [...first.changes, ...second.changes].map(upsertId);
    expect(new Set(cycleIds).size).toBe(105);

    const nextCycle = await changePage(
      await apiFetch(`/api/v2/changes?cursor=${second.nextCursor}`, readToken)
    );
    expect(nextCycle.changes.map(upsertId)).toEqual(["msg_changes_bulk_000"]);
  });

  it("returns a durable tombstone when retention removes a message", async () => {
    const cursor = await checkpoint();
    const stamp = "2026-08-17T00:03:00.000Z";
    await messageRow("msg_changes_delete", "thr_changes", "mbx_changes", stamp).run();
    await env.DB.prepare("DELETE FROM messages WHERE id = 'msg_changes_delete'").run();

    const page = await changePage(
      await apiFetch(`/api/v2/changes?cursor=${cursor}&limit=2`, readToken)
    );
    expect(page).toMatchObject({ hasMore: false });
    expect(page.changes).toEqual([
      { type: "delete", messageId: "msg_changes_delete", mailboxId: "mbx_changes" }
    ]);
  });

  it("applies live mailbox access and requires bootstrap after a new grant", async () => {
    const cursor = await checkpoint();
    const stamp = "2026-08-17T00:04:00.000Z";
    await env.DB.batch([
      messageRow("msg_changes_revoked", "thr_changes", "mbx_changes", stamp),
      messageRow("msg_changes_hidden", "thr_changes_secret", "mbx_changes_secret", stamp)
    ]);
    await env.DB.prepare(
      "DELETE FROM mailbox_grants WHERE mailbox_id = 'mbx_changes' AND principal_id = ?"
    )
      .bind(userId)
      .run();

    const hidden = await changePage(await apiFetch(`/api/v2/changes?cursor=${cursor}`, readToken));
    expect(hidden.changes).toEqual([]);
    await grantRow("mbx_changes", stamp).run();

    const afterGrant = await changePage(
      await apiFetch(`/api/v2/changes?cursor=${hidden.nextCursor}`, readToken)
    );
    expect(afterGrant.changes).toEqual([]);
    await messageRow("msg_changes_after_grant", "thr_changes", "mbx_changes", stamp).run();
    const newChange = await changePage(
      await apiFetch(`/api/v2/changes?cursor=${afterGrant.nextCursor}`, readToken)
    );
    expect(newChange.changes.map(upsertId)).toEqual(["msg_changes_after_grant"]);
  });

  it("includes unassigned changes only for owners", async () => {
    const stamp = "2026-08-17T00:05:00.000Z";
    try {
      for (const role of ["member", "admin"] as const) {
        await setChangesUserRole(role);
        const cursor = await checkpoint();
        const suffix = role;
        await env.DB.batch([
          threadRow(`thr_changes_unassigned_${suffix}`, stamp),
          unassignedMessageRow(
            `msg_changes_unassigned_${suffix}`,
            `thr_changes_unassigned_${suffix}`,
            stamp
          )
        ]);
        const page = await changePage(
          await apiFetch(`/api/v2/changes?cursor=${cursor}`, readToken)
        );
        expect(page.changes).toEqual([]);
      }

      await setChangesUserRole("owner");
      const cursor = await checkpoint();
      await env.DB.batch([
        threadRow("thr_changes_unassigned_owner", stamp),
        unassignedMessageRow("msg_changes_unassigned_owner", "thr_changes_unassigned_owner", stamp)
      ]);
      const upsertPage = await changePage(
        await apiFetch(`/api/v2/changes?cursor=${cursor}`, readToken)
      );
      expect(upsertPage.changes.map(upsertId)).toEqual(["msg_changes_unassigned_owner"]);

      await env.DB.prepare("DELETE FROM messages WHERE id = 'msg_changes_unassigned_owner'").run();
      const deletePage = await changePage(
        await apiFetch(`/api/v2/changes?cursor=${upsertPage.nextCursor}`, readToken)
      );
      expect(deletePage.changes).toEqual([
        { type: "delete", messageId: "msg_changes_unassigned_owner", mailboxId: null }
      ]);
    } finally {
      await setChangesUserRole("member");
    }
  });

  it("validates scope, filters, limits, and opaque cursor bounds", async () => {
    const noRead = await apiFetch("/api/v2/changes", writeToken);
    expect(noRead.status).toBe(403);
    expect(noRead.headers.get("www-authenticate")).toContain('scope="mail:read"');

    for (const path of [
      "/api/v2/changes?limit=0",
      "/api/v2/changes?limit=101",
      "/api/v2/changes?limit=1.5"
    ]) {
      const response = await apiFetch(path, readToken);
      expect(response.status, path).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_LIMIT" } });
    }

    for (const path of [
      "/api/v2/changes?folder=inbox",
      "/api/v2/changes?labelIds=lbl_one&labelIds=lbl_two"
    ]) {
      const filtered = await apiFetch(path, readToken);
      expect(filtered.status, path).toBe(400);
      await expect(filtered.json()).resolves.toMatchObject({
        error: { code: "INVALID_CHANGE_FILTER" }
      });
    }

    const future = encodeChangeCursor({ after: "9223372036854775807", highWater: null });
    for (const value of ["not-a-cursor", future]) {
      const response = await apiFetch(
        `/api/v2/changes?cursor=${encodeURIComponent(value)}`,
        readToken
      );
      expect(response.status, value).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_CHANGE_CURSOR" }
      });
    }
  });
});

type ChangePage = {
  changes: Array<{
    type: "upsert" | "delete";
    message?: { id: string };
    messageId?: string;
    mailboxId?: string | null;
  }>;
  nextCursor: string;
  hasMore: boolean;
};

async function checkpoint(): Promise<string> {
  return (await changePage(await apiFetch("/api/v2/changes", readToken))).nextCursor;
}

async function changePage(response: Response): Promise<ChangePage> {
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json<ChangePage>();
}

function upsertId(change: ChangePage["changes"][number]): string {
  if (change.type !== "upsert" || !change.message) throw new Error("Expected an upsert change.");
  return change.message.id;
}

function mailboxRow(id: string, address: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailboxes
     (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
     VALUES (?, ?, 'dom_changes', ?, 1, ?, ?)`
  ).bind(id, address, id, stamp, stamp);
}

function grantRow(mailboxId: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailbox_grants (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
     VALUES (?, ?, 'agent', ?, ?, ?)`
  ).bind(mailboxId, userId, userId, stamp, stamp);
}

function threadRow(id: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, id, stamp, stamp, stamp);
}

function messageRow(
  id: string,
  threadId: string,
  mailboxId: string,
  stamp: string
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, direction, folder, from_address, from_name, to_json, cc_json, bcc_json,
      subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
      received_at, sent_at, read_at, has_attachments, created_at, updated_at)
     VALUES (?, ?, ?, 'inbound', 'inbox', 'sender@example.net', 'Sender Example', '[]', '[]', '[]', ?, '', '',
             NULL, ?, NULL, '[]', ?, NULL, NULL, 0, ?, ?)`
  ).bind(id, threadId, mailboxId, id, `dedupe-${id}`, stamp, stamp, stamp);
}

function unassignedMessageRow(id: string, threadId: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, is_unassigned, direction, folder, from_address,
      to_json, cc_json, bcc_json, subject, snippet, text_body, references_json,
      received_at, has_attachments, created_at, updated_at)
     VALUES (?, ?, NULL, 1, 'inbound', 'catchall', 'sender@example.net', '[]', '[]', '[]',
             ?, '', '', '[]', ?, 0, ?, ?)`
  ).bind(id, threadId, id, stamp, stamp, stamp);
}

async function setChangesUserRole(role: "admin" | "member" | "owner"): Promise<void> {
  await env.DB.prepare(`UPDATE "user" SET role = ? WHERE id = ?`).bind(role, userId).run();
}

function apiFetch(path: string, token: string): Promise<Response> {
  return SELF.fetch(`${origin}${path}`, { headers: { authorization: `Bearer ${token}` } });
}
