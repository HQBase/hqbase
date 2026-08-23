import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import {
  listAccessibleDraftPage,
  requireDraftAccess
} from "../../../worker/features/drafts/access";
import { encodeDraftChangeCursor } from "../../../worker/features/drafts/change-cursor";
import { encodeChangeCursor } from "../../../worker/features/messages/change-cursor";
import { applyCurrentMigrations } from "./current-migrations";
import { tokenRow } from "./mail-api-token-fixture";

const origin = "https://hqbase.test";
const apiResource = `${origin}/api/v2`;
const sendToken = "hqb_access_draft-sync-send-token";
const readToken = "hqb_access_draft-sync-read-token";
let userId = "";

describe("HQBase Mail API draft synchronization", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "draft-sync-member@login.example",
          name: "Draft Sync Member",
          password: "draft-sync-test-password",
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
      .bind("draft-sync-member@login.example")
      .first<{ id: string; sessionId: string }>();
    if (!user) throw new Error("Draft sync API test user was not created.");
    userId = user.id;

    const stamp = "2026-08-22T00:00:00.000Z";
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const tokenRows = await Promise.all([
      tokenRow(
        env.DB,
        "tok_draft_sync_send",
        sendToken,
        "client_draft_sync_api",
        user.sessionId,
        user.id,
        future,
        ["mail:send"],
        apiResource
      ),
      tokenRow(
        env.DB,
        "tok_draft_sync_read",
        readToken,
        "client_draft_sync_api",
        user.sessionId,
        user.id,
        future,
        ["mail:read"],
        apiResource
      )
    ]);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_draft_sync', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(stamp, stamp),
      mailboxRow("mbx_draft_sync", "draft-sync@example.com", stamp),
      mailboxRow("mbx_draft_sync_secret", "secret-draft@example.com", stamp),
      grantRow("mbx_draft_sync", stamp),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('client_row_draft_sync', 'client_draft_sync_api', 0, ?, 1, 1, ?, ?)`
      ).bind(JSON.stringify(["https://client.example/drafts"]), stamp, stamp),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, resources, createdAt, updatedAt)
         VALUES ('consent_draft_sync', 'client_draft_sync_api', ?, ?, ?, ?, ?)`
      ).bind(
        user.id,
        JSON.stringify(["mail:read", "mail:send"]),
        JSON.stringify([apiResource]),
        stamp,
        stamp
      ),
      ...tokenRows,
      draftRow("drf_sync_historical", "mbx_draft_sync", "2026-08-22T00:00:00.000Z")
    ]);
  });

  it("starts with a checkpoint and does not replay historical drafts", async () => {
    const first = await changePage(await apiFetch("/api/v2/drafts/changes", sendToken));
    expect(first).toMatchObject({ changes: [], hasMore: false });

    const next = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${first.nextCursor}`, sendToken)
    );
    expect(next).toMatchObject({ changes: [], hasMore: false });
  });

  it("paginates drafts in stable update and id order without exposing inaccessible rows", async () => {
    const tie = "2026-08-22T01:00:02.000Z";
    await env.DB.batch([
      draftRow("drf_page_1", "mbx_draft_sync", "2026-08-22T01:00:03.000Z"),
      draftRow("drf_page_2", "mbx_draft_sync", tie),
      draftRow("drf_page_3", "mbx_draft_sync", tie),
      draftRow("drf_page_4", "mbx_draft_sync", tie),
      draftRow("drf_page_5", "mbx_draft_sync", "2026-08-22T01:00:01.000Z"),
      draftRow("drf_page_secret", "mbx_draft_sync_secret", tie)
    ]);
    await env.DB.prepare(
      `INSERT INTO draft_attachments
       (id, draft_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES ('att_page_1', 'drf_page_1', 'page.txt', 'text/plain', 4,
               'drafts/page/page.txt', ?)`
    )
      .bind(tie)
      .run();

    const pages: Array<Array<{ id: string; attachments: Array<{ id: string }> }>> = [];
    let next: string | null = `${origin}/api/v2/drafts?limit=2`;
    while (next) {
      if (pages.length > 20) throw new Error("Draft pagination did not terminate.");
      const response = await apiFetch(next.slice(origin.length), sendToken);
      expect(response.status, await response.clone().text()).toBe(200);
      pages.push(await response.json());
      next = nextPageUrl(response);
    }

    const drafts = pages.flat();
    const pageDrafts = drafts.filter((draft) => draft.id.startsWith("drf_page_"));
    expect(pageDrafts.map((draft) => draft.id)).toEqual([
      "drf_page_1",
      "drf_page_4",
      "drf_page_3",
      "drf_page_2",
      "drf_page_5"
    ]);
    expect(drafts.map((draft) => draft.id)).not.toContain("drf_page_secret");
    expect(drafts.find((draft) => draft.id === "drf_page_1")?.attachments).toEqual([
      expect.objectContaining({ id: "att_page_1" })
    ]);
  });

  it("starts with a checkpoint and journals draft and attachment changes", async () => {
    const cursor = await checkpoint();
    const stamp = "2026-08-22T02:00:00.000Z";
    await draftRow("drf_changes", "mbx_draft_sync", stamp).run();
    await env.DB.prepare(
      `INSERT INTO draft_attachments
       (id, draft_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES ('att_changes', 'drf_changes', 'change.txt', 'text/plain', 6,
               'drafts/changes/change.txt', ?)`
    )
      .bind(stamp)
      .run();
    await env.DB.prepare("DELETE FROM draft_attachments WHERE id = 'att_changes'").run();

    const upserts = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${cursor}`, sendToken)
    );
    expect(upserts.hasMore).toBe(false);
    expect(upserts.changes).toHaveLength(3);
    for (const change of upserts.changes) {
      expect(change).toMatchObject({
        type: "upsert",
        draft: { id: "drf_changes", attachments: [] }
      });
    }

    await env.DB.prepare("DELETE FROM drafts WHERE id = 'drf_changes'").run();
    const deletion = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${upserts.nextCursor}`, sendToken)
    );
    expect(deletion.changes).toEqual([{ type: "delete", draftId: "drf_changes" }]);
  });

  it("bounds each change cycle at its high-water sequence", async () => {
    const cursor = await checkpoint();
    const stamp = "2026-08-22T03:00:00.000Z";
    await env.DB.batch([
      draftRow("drf_cycle_1", "mbx_draft_sync", stamp),
      draftRow("drf_cycle_2", "mbx_draft_sync", stamp),
      draftRow("drf_cycle_3", "mbx_draft_sync", stamp)
    ]);

    const first = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${cursor}&limit=2`, sendToken)
    );
    expect(first.hasMore).toBe(true);
    expect(first.changes.map(upsertId)).toEqual(["drf_cycle_1", "drf_cycle_2"]);

    await env.DB.prepare(
      "UPDATE drafts SET subject = 'Later', version = 2, updated_at = ? WHERE id = ?"
    )
      .bind("2026-08-22T03:00:01.000Z", "drf_cycle_1")
      .run();
    const second = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${first.nextCursor}&limit=2`, sendToken)
    );
    expect(second.hasMore).toBe(false);
    expect(second.changes.map(upsertId)).toEqual(["drf_cycle_3"]);

    const nextCycle = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${second.nextCursor}`, sendToken)
    );
    expect(nextCycle.changes.map(upsertId)).toEqual(["drf_cycle_1"]);
  });

  it("applies live mailbox access to upserts and uses user-owned tombstones", async () => {
    const cursor = await checkpoint();
    const stamp = "2026-08-22T04:00:00.000Z";
    await draftRow("drf_access_revoked", "mbx_draft_sync", stamp).run();
    await env.DB.prepare(
      "DELETE FROM mailbox_grants WHERE mailbox_id = 'mbx_draft_sync' AND user_id = ?"
    )
      .bind(userId)
      .run();

    const hidden = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${cursor}`, sendToken)
    );
    expect(hidden.changes).toEqual([]);

    await grantRow("mbx_draft_sync", stamp).run();
    await env.DB.prepare("DELETE FROM drafts WHERE id = 'drf_access_revoked'").run();
    const deletion = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${hidden.nextCursor}`, sendToken)
    );
    expect(deletion.changes).toEqual([{ type: "delete", draftId: "drf_access_revoked" }]);
  });

  it("uses the same access rules for banned users and inaccessible message targets", async () => {
    const stamp = "2026-08-22T05:00:00.000Z";
    await env.DB.batch([
      threadRow("thr_draft_secret_target", stamp),
      messageRow(
        "msg_draft_secret_target",
        "thr_draft_secret_target",
        "mbx_draft_sync_secret",
        stamp
      ),
      draftRow("drf_secret_target", "mbx_draft_sync", stamp)
    ]);
    await env.DB.prepare("UPDATE drafts SET reply_to_message_id = ? WHERE id = 'drf_secret_target'")
      .bind("msg_draft_secret_target")
      .run();

    const listed = await apiFetch("/api/v2/drafts?limit=100", sendToken);
    expect(listed.status, await listed.clone().text()).toBe(200);
    expect((await listed.json<Array<{ id: string }>>()).map((draft) => draft.id)).not.toContain(
      "drf_secret_target"
    );
    await expect(
      requireDraftAccess(
        env,
        { role: "member", userId },
        {
          mailboxId: "mbx_draft_sync",
          from: "draft-sync@example.com",
          replyToMessageId: "msg_draft_secret_target",
          forwardOfMessageId: null
        }
      )
    ).rejects.toMatchObject({ code: "MAILBOX_FORBIDDEN", status: 403 });

    await env.DB.prepare(`UPDATE "user" SET banned = 1 WHERE id = ?`).bind(userId).run();
    try {
      const page = await listAccessibleDraftPage(env, { role: "member", userId }, { limit: 100 });
      expect(page.drafts).toEqual([]);
      await expect(
        requireDraftAccess(
          env,
          { role: "member", userId },
          {
            mailboxId: null,
            from: "",
            replyToMessageId: null,
            forwardOfMessageId: null
          }
        )
      ).rejects.toMatchObject({ code: "MAILBOX_FORBIDDEN", status: 403 });
    } finally {
      await env.DB.prepare(`UPDATE "user" SET banned = 0 WHERE id = ?`).bind(userId).run();
    }
  });

  it("loads a full 100-change page within the D1 parameter limit", async () => {
    const cursor = await checkpoint();
    const stamp = "2026-08-22T06:00:00.000Z";
    await env.DB.batch(
      Array.from({ length: 100 }, (_, index) =>
        draftRow(`drf_full_page_${String(index).padStart(3, "0")}`, "mbx_draft_sync", stamp)
      )
    );

    const page = await changePage(
      await apiFetch(`/api/v2/drafts/changes?cursor=${cursor}&limit=100`, sendToken)
    );
    expect(page.hasMore).toBe(false);
    expect(page.changes).toHaveLength(100);
  });

  it("validates scope, filters, limits, and foreign cursors", async () => {
    const noSend = await apiFetch("/api/v2/drafts/changes", readToken);
    expect(noSend.status).toBe(403);
    expect(noSend.headers.get("www-authenticate")).toContain('scope="mail:send"');

    for (const path of [
      "/api/v2/drafts?limit=0",
      "/api/v2/drafts?limit=101",
      "/api/v2/drafts/changes?limit=1.5"
    ]) {
      const response = await apiFetch(path, sendToken);
      expect(response.status, path).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_LIMIT" } });
    }

    const filtered = await apiFetch("/api/v2/drafts/changes?updatedSince=now", sendToken);
    expect(filtered.status).toBe(400);
    await expect(filtered.json()).resolves.toMatchObject({
      error: { code: "INVALID_DRAFT_CHANGE_FILTER" }
    });

    const messageCursor = encodeChangeCursor({ after: "0", highWater: null });
    const listWithForeignCursor = await apiFetch(
      `/api/v2/drafts?cursor=${encodeURIComponent(messageCursor)}`,
      sendToken
    );
    expect(listWithForeignCursor.status).toBe(400);
    await expect(listWithForeignCursor.json()).resolves.toMatchObject({
      error: { code: "INVALID_DRAFT_CURSOR" }
    });

    const future = encodeDraftChangeCursor({
      after: "9223372036854775807",
      highWater: null,
      userId
    });
    for (const value of [messageCursor, future]) {
      const response = await apiFetch(
        `/api/v2/drafts/changes?cursor=${encodeURIComponent(value)}`,
        sendToken
      );
      expect(response.status, value).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_DRAFT_CHANGE_CURSOR" }
      });
    }
  });
});

type DraftChangePage = {
  changes: Array<{
    type: "upsert" | "delete";
    draft?: { id: string };
    draftId?: string;
  }>;
  nextCursor: string;
  hasMore: boolean;
};

async function checkpoint(): Promise<string> {
  return (await changePage(await apiFetch("/api/v2/drafts/changes", sendToken))).nextCursor;
}

async function changePage(response: Response): Promise<DraftChangePage> {
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json<DraftChangePage>();
}

function upsertId(change: DraftChangePage["changes"][number]): string {
  if (change.type !== "upsert" || !change.draft) throw new Error("Expected a draft upsert.");
  return change.draft.id;
}

function nextPageUrl(response: Response): string | null {
  const link = response.headers.get("link");
  if (!link) return null;
  const match = link.match(/^<([^>]+)>;\s*rel="next"$/u);
  if (!match?.[1]) throw new Error(`Malformed Link header: ${link}`);
  return match[1];
}

function mailboxRow(id: string, address: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailboxes
     (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
     VALUES (?, ?, 'dom_draft_sync', ?, 1, ?, ?)`
  ).bind(id, address, id, stamp, stamp);
}

function grantRow(mailboxId: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailbox_grants (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
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
     (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
      received_at, sent_at, read_at, has_attachments, created_at, updated_at)
     VALUES (?, ?, ?, 'inbound', 'inbox', 'sender@example.net', '[]', '[]', '[]', ?, '', '',
             NULL, ?, NULL, '[]', ?, NULL, NULL, 0, ?, ?)`
  ).bind(id, threadId, mailboxId, id, `dedupe-${id}`, stamp, stamp, stamp);
}

function draftRow(id: string, mailboxId: string, stamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO drafts
     (id, user_id, mailbox_id, from_address, to_json, cc_json, bcc_json, subject,
      text_body, html_body, created_at, updated_at)
     VALUES (?, ?, ?, 'draft-sync@example.com', '[]', '[]', '[]', ?, '', '', ?, ?)`
  ).bind(id, userId, mailboxId, id, stamp, stamp);
}

function apiFetch(path: string, token: string): Promise<Response> {
  return SELF.fetch(`${origin}${path}`, { headers: { authorization: `Bearer ${token}` } });
}
