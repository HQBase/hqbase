import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { applyCurrentMigrations } from "./current-migrations";
import { tokenRow } from "./mail-api-token-fixture";

const origin = "https://hqbase.test";
const pngDataUrl = "data:image/png;base64,iVBORw0KGgo=";
let ownerCookie = "";
let memberCookie = "";
let ownerId = "";
let memberId = "";
let personalId = "";
let mailboxId = "";
let domainId = "";
let otherMailboxId = "";

describe("signature routes", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    ({ cookie: ownerCookie, userId: ownerId } = await createUser(
      "signature-route-owner@login.example",
      "Signature Route Owner"
    ));
    ({ cookie: memberCookie, userId: memberId } = await createUser(
      "signature-route-member@login.example",
      "Signature Route Member"
    ));
    await env.DB.prepare(`UPDATE "user" SET role = 'owner' WHERE id = ?`).bind(ownerId).run();

    const timestamp = "2026-08-24T16:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES
          ('dom_signature_routes', 'signature-routes.example', 'ready', 'ready', 'ready', 1, ?, ?),
          ('dom_signature_other', 'signature-other.example', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES
          ('mbx_signature_routes', 'team@signature-routes.example', 'dom_signature_routes',
           'Team', 1, ?, ?),
          ('mbx_signature_other', 'other@signature-other.example', 'dom_signature_other',
           'Other', 1, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp),
      grant("mbx_signature_routes", timestamp),
      grant("mbx_signature_other", timestamp),
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES ('thr_signature_routes', 'signature source', ?, ?, ?)`
      ).bind(timestamp, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO messages
         (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
          subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
          received_at, has_attachments, created_at, updated_at)
         VALUES
          ('msg_signature_routes', 'thr_signature_routes', 'mbx_signature_routes', 'inbound',
           'inbox', 'reader@example.net', '["team@signature-routes.example"]', '[]', '[]',
           'Signature source', 'Earlier body', 'Earlier body', '<signature-source@example.net>',
           'signature-source', NULL, '[]', ?, 0, ?, ?)`
      ).bind(timestamp, timestamp, timestamp)
    ]);
  });

  it("enforces management access and audits outcomes without signature content", async () => {
    const personal = await create(memberCookie, {
      name: "Personal route",
      html: `<p>Personal route content</p><img src="${pngDataUrl}" alt="Personal route logo" width="64" height="64">`,
      scope: { type: "user", id: memberId },
      isDefault: true
    });
    personalId = personal.id;

    const forbiddenCreate = await sessionFetch("/api/signatures", memberCookie, {
      body: JSON.stringify({
        name: "Private denied name",
        html: "<p>Private denied content</p>",
        scope: { type: "mailbox", id: "mbx_signature_routes" },
        isDefault: true
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(forbiddenCreate.status).toBe(403);
    await expect(forbiddenCreate.json()).resolves.toMatchObject({
      error: { code: "SIGNATURE_FORBIDDEN" }
    });

    const mailbox = await create(ownerCookie, {
      name: "Mailbox route",
      html: "<p>Mailbox route content</p>",
      scope: { type: "mailbox", id: "mbx_signature_routes" },
      isDefault: true
    });
    mailboxId = mailbox.id;
    const domain = await create(ownerCookie, {
      name: "Domain route",
      html: "<p>Domain route content</p>",
      scope: { type: "domain", id: "dom_signature_routes" },
      isDefault: true
    });
    domainId = domain.id;
    const otherMailbox = await create(ownerCookie, {
      name: "Other mailbox route",
      html: "<p>Other mailbox route content</p>",
      scope: { type: "mailbox", id: "mbx_signature_other" },
      isDefault: true
    });
    otherMailboxId = otherMailbox.id;
    const disposable = await create(ownerCookie, {
      name: "Disposable route",
      html: "<p>Disposable route content</p>",
      scope: { type: "mailbox", id: "mbx_signature_routes" },
      isDefault: false
    });

    const forbiddenUpdate = await sessionFetch(`/api/signatures/${mailbox.id}`, memberCookie, {
      body: JSON.stringify({ html: "<p>Private rejected update</p>" }),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
    expect(forbiddenUpdate.status).toBe(403);

    const updated = await sessionFetch(`/api/signatures/${domain.id}`, ownerCookie, {
      body: JSON.stringify({ name: "Domain route updated" }),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
    expect(updated.status, await updated.clone().text()).toBe(200);

    const forbiddenDelete = await sessionFetch(`/api/signatures/${disposable.id}`, memberCookie, {
      method: "DELETE"
    });
    expect(forbiddenDelete.status).toBe(403);
    const deleted = await sessionFetch(`/api/signatures/${disposable.id}`, ownerCookie, {
      method: "DELETE"
    });
    expect(deleted.status).toBe(204);

    const audits = await env.DB.prepare(
      `SELECT action, actor_id, outcome, resource_id, metadata_json
       FROM audit_events WHERE action LIKE 'signature.%' ORDER BY occurred_at, id`
    ).all<{
      action: string;
      actor_id: string;
      outcome: string;
      resource_id: string | null;
      metadata_json: string;
    }>();
    expect(audits.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "signature.create", outcome: "success" }),
        expect.objectContaining({ action: "signature.create", outcome: "denied" }),
        expect.objectContaining({ action: "signature.update", outcome: "success" }),
        expect.objectContaining({ action: "signature.update", outcome: "denied" }),
        expect.objectContaining({ action: "signature.delete", outcome: "success" }),
        expect.objectContaining({ action: "signature.delete", outcome: "denied" }),
        expect.objectContaining({ action: "signature.default.change", outcome: "success" }),
        expect.objectContaining({ action: "signature.default.change", outcome: "denied" })
      ])
    );
    for (const audit of audits.results) {
      expect(JSON.parse(audit.metadata_json)).toMatchObject({
        scopeType: expect.stringMatching(/^(user|mailbox|domain)$/u),
        targetId: expect.any(String)
      });
    }
    expect(JSON.stringify(audits.results)).not.toMatch(
      /Personal route|Private denied|route content|Private rejected/iu
    );
  });

  it("lists manageable and exact-address candidate signatures on both API versions", async () => {
    const manageable = await sessionFetch("/api/signatures", memberCookie);
    expect(manageable.status, await manageable.clone().text()).toBe(200);
    expect(((await manageable.json()) as Array<{ id: string }>).map(({ id }) => id)).toEqual([
      personalId
    ]);

    for (const version of ["v1", "v2"]) {
      const response = await sessionFetch(
        `/api/${version}/signatures?from=team%40signature-routes.example`,
        memberCookie
      );
      expect(response.status, await response.clone().text()).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        automaticSignatureId: mailboxId,
        signatures: expect.arrayContaining([
          expect.objectContaining({ id: personalId, scope: "user" }),
          expect.objectContaining({ id: mailboxId, scope: "mailbox" }),
          expect.objectContaining({ id: domainId, scope: "domain" })
        ])
      });
    }

    const invalid = await sessionFetch("/api/v2/signatures?from=invalid", memberCookie);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "SIGNATURE_INVALID" } });
  });

  it.each([
    "v1",
    "v2"
  ])("manages signatures with a separate OAuth permission on %s", async (version) => {
    const base = `/api/${version}/signatures`;
    const client = `signature-manager-${version}`;
    const bearer = `hqb_access_${client}`;
    const sendBearer = `hqb_access_${client}-send`;
    const session = await env.DB.prepare('SELECT id FROM "session" WHERE userId = ?')
      .bind(memberId)
      .first<{ id: string }>();
    if (!session) throw new Error("Expected member session.");
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 3600000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO oauthClient (id, clientId, redirectUris, createdAt, updatedAt) VALUES (?, ?, '[]', ?, ?)"
      ).bind(client, client, now, now),
      env.DB.prepare(
        "INSERT INTO oauthConsent (id, clientId, userId, scopes, resources, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        client,
        client,
        memberId,
        '["signatures:manage","mail:send"]',
        JSON.stringify([`${origin}/api/${version}`]),
        now,
        now
      ),
      await tokenRow(
        env.DB,
        client,
        bearer,
        client,
        session.id,
        memberId,
        future,
        ["signatures:manage"],
        `${origin}/api/${version}`
      ),
      await tokenRow(
        env.DB,
        `${client}-send`,
        sendBearer,
        client,
        session.id,
        memberId,
        future,
        ["mail:send"],
        `${origin}/api/${version}`
      )
    ]);
    const api = (path: string, method = "GET", body?: object, token = bearer) =>
      SELF.fetch(`${origin}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    const input = {
      name: `API ${version}`,
      html: `<p>Private signature</p><img src="${pngDataUrl}" alt="Logo">`,
      scope: { type: "user", id: memberId },
      isDefault: false
    };
    for (const [path, method, body] of [
      [`${base}/manage`, "GET", undefined],
      [base, "POST", input],
      [`${base}/${personalId}`, "PATCH", { name: "Denied" }],
      [`${base}/${personalId}`, "DELETE", undefined]
    ] as const) {
      const denied = await api(path, method, body, sendBearer);
      expect(denied.status).toBe(403);
      expect(denied.headers.get("www-authenticate")).toContain('scope="signatures:manage"');
    }
    expect(
      (await api(`${base}?from=team%40signature-routes.example`, "GET", undefined, sendBearer))
        .status
    ).toBe(200);
    const created = await api(base, "POST", input);
    expect(created.status).toBe(201);
    const signature = await created.json<{ id: string; html: string }>();
    expect(signature.html).toContain("data:image/png");
    expect((await api(base, "POST", input)).status).toBe(409);
    expect(
      (
        await api(base, "POST", {
          ...input,
          name: "Other person",
          scope: { type: "user", id: ownerId }
        })
      ).status
    ).toBe(403);
    expect(
      (
        await api(base, "POST", {
          ...input,
          name: "Domain denied",
          scope: { type: "domain", id: "dom_signature_routes" }
        })
      ).status
    ).toBe(403);
    expect(
      (
        await api(base, "POST", {
          ...input,
          name: "Mailbox denied",
          scope: { type: "mailbox", id: "mbx_signature_routes" }
        })
      ).status
    ).toBe(403);
    expect((await api(base, "POST", { ...input, html: "x".repeat(400001) })).status).toBe(400);
    expect((await api(`${base}/${signature.id}`, "PATCH", {})).status).toBe(400);
    const changed = await api(`${base}/${signature.id}`, "PATCH", {
      name: `Changed ${version}`,
      isDefault: true
    });
    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toMatchObject({
      name: `Changed ${version}`,
      isDefault: true
    });
    const list = await api(`${base}/manage`);
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: signature.id })])
    );
    await env.DB.prepare(
      "UPDATE mailbox_grants SET access_level = 'manager' WHERE mailbox_id = ? AND principal_id = ?"
    )
      .bind("mbx_signature_routes", memberId)
      .run();
    try {
      const shared = await api(base, "POST", {
        ...input,
        name: `Shared ${version}`,
        scope: { type: "mailbox", id: "mbx_signature_routes" }
      });
      expect(shared.status).toBe(201);
      const sharedId = (await shared.json<{ id: string }>()).id;
      expect((await api(`${base}/${sharedId}`, "DELETE")).status).toBe(204);
    } finally {
      await env.DB.prepare(
        "UPDATE mailbox_grants SET access_level = 'agent' WHERE mailbox_id = ? AND principal_id = ?"
      )
        .bind("mbx_signature_routes", memberId)
        .run();
    }
    expect((await api(`${base}/${signature.id}`, "DELETE")).status).toBe(204);
    expect((await api(`${base}/${signature.id}`, "PATCH", { name: "Missing" })).status).toBe(404);
    const audits = await env.DB.prepare(
      "SELECT action, metadata_json FROM audit_events WHERE resource_id = ?"
    )
      .bind(signature.id)
      .all<{ action: string; metadata_json: string }>();
    expect(audits.results.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "signature.create",
        "signature.update",
        "signature.delete",
        "signature.default.change"
      ])
    );
    expect(JSON.stringify(audits.results)).not.toContain("Private signature");
  });

  it("resolves explicit REST selections and preserves omission semantics", async () => {
    const selected = await send("/api/v2/send", {
      from: "team@signature-routes.example",
      to: ["reader@example.net"],
      subject: "Selected signature",
      text: "Authored",
      html: "<p>Authored</p>",
      signature: { mode: "selected", id: personalId }
    });
    await expectStoredBody(selected.id, {
      before: "Authored",
      includes: "Personal route content"
    });
    const selectedRow = await env.DB.prepare(
      "SELECT has_attachments, html_r2_key FROM messages WHERE id = ?"
    )
      .bind(selected.id)
      .first<{ has_attachments: number; html_r2_key: string }>();
    expect(selectedRow?.has_attachments).toBe(0);
    const selectedHtml = selectedRow?.html_r2_key
      ? await env.MAIL_OBJECTS.get(selectedRow.html_r2_key)
      : null;
    const selectedHtmlText = await selectedHtml?.text();
    expect(selectedHtmlText).toContain('src="cid:');
    expect(selectedHtmlText).not.toContain("data:image");
    const selectedInline = await env.DB.prepare(
      "SELECT content_id, r2_key FROM message_attachments WHERE message_id = ?"
    )
      .bind(selected.id)
      .first<{ content_id: string; r2_key: string }>();
    expect(selectedInline?.content_id).toMatch(/@hqbase\.invalid$/u);
    expect(await env.MAIL_OBJECTS.get(selectedInline?.r2_key ?? "missing")).not.toBeNull();

    const reply = await send("/api/v2/reply", {
      messageId: "msg_signature_routes",
      from: "team@signature-routes.example",
      text: "Reply authored",
      signature: { mode: "automatic" }
    });
    const replyText = await storedText(reply.id);
    expect(replyText.indexOf("Reply authored")).toBeLessThan(replyText.indexOf("Mailbox route"));
    expect(replyText.indexOf("Mailbox route")).toBeLessThan(replyText.indexOf("Earlier body"));

    const forwarded = await send("/api/v2/forward", {
      messageId: "msg_signature_routes",
      from: "team@signature-routes.example",
      to: ["reader@example.net"],
      text: "Forward authored",
      includeOriginalAttachments: false,
      signature: { mode: "selected", id: domainId }
    });
    const forwardText = await storedText(forwarded.id);
    expect(forwardText.indexOf("Forward authored")).toBeLessThan(
      forwardText.indexOf("Domain route content")
    );
    expect(forwardText.indexOf("Domain route content")).toBeLessThan(
      forwardText.indexOf("Forwarded message")
    );

    const omitted = await send("/api/v2/send", {
      from: "team@signature-routes.example",
      to: ["reader@example.net"],
      subject: "No requested signature",
      text: "Unchanged body"
    });
    expect(await storedText(omitted.id)).toBe("Unchanged body");

    const unavailable = await sessionFetch("/api/v2/send", memberCookie, {
      body: JSON.stringify({
        from: "team@signature-routes.example",
        to: ["reader@example.net"],
        subject: "Wrong signature",
        text: "Do not send",
        signature: { mode: "selected", id: otherMailboxId }
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(unavailable.status).toBe(400);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "SIGNATURE_NOT_AVAILABLE" }
    });
  });
});

async function create(
  cookie: string,
  input: {
    name: string;
    html: string;
    scope: { type: "user" | "mailbox" | "domain"; id: string };
    isDefault: boolean;
  }
): Promise<{ id: string }> {
  const response = await sessionFetch("/api/signatures", cookie, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json<{ id: string }>();
}

async function send(path: string, input: object): Promise<{ id: string }> {
  const response = await sessionFetch(path, memberCookie, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json<{ id: string }>();
}

async function expectStoredBody(
  messageId: string,
  input: { before: string; includes: string }
): Promise<void> {
  const row = await env.DB.prepare("SELECT text_body, html_r2_key FROM messages WHERE id = ?")
    .bind(messageId)
    .first<{ text_body: string; html_r2_key: string | null }>();
  if (!row?.html_r2_key) throw new Error("Sent rich-text message was not stored.");
  expect(row.text_body.indexOf(input.before)).toBeLessThan(row.text_body.indexOf(input.includes));
  const object = await env.MAIL_OBJECTS.get(row.html_r2_key);
  if (!object) throw new Error("Sent rich-text object was not stored.");
  const html = await object.text();
  expect(html.indexOf(input.before)).toBeLessThan(html.indexOf(input.includes));
}

async function storedText(messageId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT text_body FROM messages WHERE id = ?")
    .bind(messageId)
    .first<{ text_body: string }>();
  if (!row) throw new Error("Sent message was not stored.");
  return row.text_body;
}

async function createUser(
  email: string,
  name: string
): Promise<{ cookie: string; userId: string }> {
  const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email,
        name,
        password: "signature-route-test-password",
        rememberMe: false
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const user = await env.DB.prepare(`SELECT id FROM "user" WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (!user) throw new Error("Signature route user was not created.");
  return { cookie: sessionCookie(response), userId: user.id };
}

function sessionFetch(path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  headers.set("origin", origin);
  return SELF.fetch(`${origin}${path}`, { ...init, headers });
}

function sessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}

function grant(mailbox: string, timestamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailbox_grants
     (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
     VALUES (?, ?, 'agent', ?, ?, ?)`
  ).bind(mailbox, memberId, ownerId, timestamp, timestamp);
}
