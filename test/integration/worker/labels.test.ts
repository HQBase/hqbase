import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
let ownerCookie = "";
let memberCookie = "";
let ownerId = "";
let memberId = "";
let labelId = "";

describe("labels", () => {
  beforeAll(async () => {
    ({ cookie: ownerCookie, userId: ownerId } = await createUser(
      "labels-owner@login.example",
      "Labels Owner"
    ));
    ({ cookie: memberCookie, userId: memberId } = await createUser(
      "labels-member@login.example",
      "Labels Member"
    ));
    await env.DB.prepare(`UPDATE "user" SET role = 'owner' WHERE id = ?`).bind(ownerId).run();

    const timestamp = "2026-08-24T13:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_labels', 'labels.example', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES
          ('mbx_labels_allowed', 'allowed@labels.example', 'dom_labels', 'Allowed', 1, ?, ?),
          ('mbx_labels_hidden', 'hidden@labels.example', 'dom_labels', 'Hidden', 1, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
         VALUES ('mbx_labels_allowed', ?, 'agent', ?, ?, ?)`
      ).bind(memberId, ownerId, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES ('thr_labels_shared', 'shared', ?, ?, ?)`
      ).bind(timestamp, timestamp, timestamp),
      labelMessage("msg_labels_allowed", "mbx_labels_allowed", "2026-08-24T13:01:00.000Z"),
      labelMessage("msg_labels_hidden", "mbx_labels_hidden", "2026-08-24T13:02:00.000Z")
    ]);
  });

  it("lets only owners and admins manage case-insensitive label definitions", async () => {
    const forbidden = await sessionFetch("/api/labels", memberCookie, {
      body: JSON.stringify({ color: "blue", name: "Customer" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "LABEL_FORBIDDEN" } });

    const created = await sessionFetch("/api/labels", ownerCookie, {
      body: JSON.stringify({ color: "blue", name: "Customer" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const label = (await created.json()) as { color: string; id: string; name: string };
    labelId = label.id;
    expect(label).toMatchObject({ color: "blue", name: "Customer" });

    const conflict = await sessionFetch("/api/labels", ownerCookie, {
      body: JSON.stringify({ color: "green", name: "customer" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "LABEL_NAME_CONFLICT" } });

    const invalid = await sessionFetch("/api/labels", ownerCookie, {
      body: JSON.stringify({ color: "ultraviolet", name: "Invalid" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "LABEL_INVALID" } });
  });

  it("lists labels through both stable Mail API versions", async () => {
    for (const version of ["v1", "v2"]) {
      const response = await sessionFetch(`/api/${version}/labels`, memberCookie);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual([
        expect.objectContaining({ color: "blue", id: labelId, name: "Customer" })
      ]);
    }
  });

  it("applies conversation labels only to accessible organizable messages", async () => {
    const response = await sessionFetch(
      `/api/v2/conversations/msg_labels_allowed/labels/${labelId}`,
      memberCookie,
      { method: "PUT" }
    );
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({
      affected: 1,
      assigned: true,
      labelId,
      threadId: "thr_labels_shared"
    });
    const assignments = await env.DB.prepare(
      "SELECT message_id FROM message_labels WHERE label_id = ? ORDER BY message_id"
    )
      .bind(labelId)
      .all<{ message_id: string }>();
    expect(assignments.results).toEqual([{ message_id: "msg_labels_allowed" }]);
  });

  it("filters messages and conversations by label without changing v1 response shapes", async () => {
    const v1Messages = await sessionFetch(`/api/v1/messages?labelId=${labelId}`, memberCookie);
    expect(v1Messages.status, await v1Messages.clone().text()).toBe(200);
    const v1Body = (await v1Messages.json()) as Array<Record<string, unknown>>;
    expect(v1Body.map((message) => message.id)).toEqual(["msg_labels_allowed"]);
    expect(v1Body[0]).not.toHaveProperty("labels");

    const v2Messages = await sessionFetch(`/api/v2/messages?labelId=${labelId}`, memberCookie);
    expect(await v2Messages.json()).toEqual([
      expect.objectContaining({
        id: "msg_labels_allowed",
        labels: [expect.objectContaining({ id: labelId, name: "Customer" })]
      })
    ]);

    const conversations = await sessionFetch(
      `/api/v2/conversations?labelId=${labelId}`,
      memberCookie
    );
    expect(await conversations.json()).toMatchObject({
      conversations: [
        {
          id: "msg_labels_allowed",
          labels: [expect.objectContaining({ id: labelId })]
        }
      ]
    });

    const missing = await sessionFetch("/api/v2/messages?labelId=lbl_missing", memberCookie);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "LABEL_NOT_FOUND" } });
  });

  it("requires Handle mail access for assignment and supports idempotent removal", async () => {
    await env.DB.prepare(
      `UPDATE mailbox_grants SET access_level = 'read'
       WHERE mailbox_id = 'mbx_labels_allowed' AND principal_id = ?`
    )
      .bind(memberId)
      .run();
    const forbidden = await sessionFetch(
      `/api/v2/messages/msg_labels_allowed/labels/${labelId}`,
      memberCookie,
      { method: "DELETE" }
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "LABEL_FORBIDDEN" } });

    await env.DB.prepare(
      `UPDATE mailbox_grants SET access_level = 'agent'
       WHERE mailbox_id = 'mbx_labels_allowed' AND principal_id = ?`
    )
      .bind(memberId)
      .run();
    const removed = await sessionFetch(
      `/api/v1/messages/msg_labels_allowed/labels/${labelId}`,
      memberCookie,
      { method: "DELETE" }
    );
    expect(removed.status, await removed.clone().text()).toBe(200);
    expect(await removed.json()).toMatchObject({ affected: 1, assigned: false, labelId });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM message_labels WHERE label_id = ?")
        .bind(labelId)
        .first()
    ).toEqual({ count: 0 });
  });

  it("deletes assignments with a label without deleting mail", async () => {
    await sessionFetch(`/api/v2/messages/msg_labels_allowed/labels/${labelId}`, memberCookie, {
      method: "PUT"
    });
    const deleted = await sessionFetch(`/api/labels/${labelId}`, ownerCookie, {
      method: "DELETE"
    });
    expect(deleted.status).toBe(204);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM messages WHERE id = 'msg_labels_allowed'"
      ).first()
    ).toEqual({ count: 1 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM message_labels WHERE label_id = ?")
        .bind(labelId)
        .first()
    ).toEqual({ count: 0 });
  });
});

async function createUser(
  email: string,
  name: string
): Promise<{ cookie: string; userId: string }> {
  await applyCurrentMigrations();
  const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email, name, password: "labels-test-password", rememberMe: false }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const user = await env.DB.prepare(`SELECT id FROM "user" WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (!user) throw new Error("Label test user was not created.");
  return { cookie: sessionCookie(response), userId: user.id };
}

function sessionFetch(path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return SELF.fetch(`${origin}${path}`, { ...init, headers });
}

function sessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}

function labelMessage(id: string, mailboxId: string, timestamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, references_json, received_at, has_attachments, created_at, updated_at)
     VALUES (?, 'thr_labels_shared', ?, 'inbound', 'inbox', 'sender@example.net', '[]', '[]', '[]',
       'Shared', 'Shared', 'Shared', '[]', ?, 0, ?, ?)`
  ).bind(id, mailboxId, timestamp, timestamp, timestamp);
}
