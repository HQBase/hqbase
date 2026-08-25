import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
let firstCookie = "";
let secondCookie = "";
let firstUserId = "";
let secondUserId = "";

describe("contacts", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    ({ cookie: firstCookie, userId: firstUserId } = await createUser(
      "contacts-one@login.example",
      "Contacts One"
    ));
    ({ cookie: secondCookie, userId: secondUserId } = await createUser(
      "contacts-two@login.example",
      "Contacts Two"
    ));

    const timestamp = "2026-08-24T12:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_contacts', 'contacts.example', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_contacts_one', 'support@contacts.example', 'dom_contacts', 'Support', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_contacts_two', 'private@contacts.example', 'dom_contacts', 'Private', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
         VALUES ('mbx_contacts_one', ?, 'read', ?, ?, ?)`
      ).bind(firstUserId, firstUserId, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
         VALUES ('mbx_contacts_two', ?, 'read', ?, ?, ?)`
      ).bind(secondUserId, secondUserId, timestamp, timestamp),
      thread("thr_contacts_inbound", "Inbound", "2026-08-24T12:01:00.000Z"),
      message({
        from: "pat@example.net",
        id: "msg_contacts_inbound",
        mailboxId: "mbx_contacts_one",
        receivedAt: "2026-08-24T12:01:00.000Z",
        subject: "Inbound",
        threadId: "thr_contacts_inbound",
        to: ["support@contacts.example"]
      }),
      thread("thr_contacts_inbound_only", "Inbound only", "2026-08-24T12:01:30.000Z"),
      message({
        from: "inbound-only@example.net",
        id: "msg_contacts_inbound_only",
        mailboxId: "mbx_contacts_one",
        receivedAt: "2026-08-24T12:01:30.000Z",
        subject: "Inbound only",
        threadId: "thr_contacts_inbound_only",
        to: ["support@contacts.example"]
      }),
      thread("thr_contacts_outbound", "Outbound", "2026-08-24T12:02:00.000Z"),
      message({
        bcc: ["quiet@example.net"],
        cc: ["team@example.net"],
        direction: "outbound",
        from: "support@contacts.example",
        id: "msg_contacts_outbound",
        mailboxId: "mbx_contacts_one",
        receivedAt: "2026-08-24T12:02:00.000Z",
        subject: "Outbound",
        threadId: "thr_contacts_outbound",
        to: ["pat@example.net"]
      }),
      thread("thr_contacts_private", "Private", "2026-08-24T12:03:00.000Z"),
      message({
        from: "hidden@example.net",
        id: "msg_contacts_private",
        mailboxId: "mbx_contacts_two",
        receivedAt: "2026-08-24T12:03:00.000Z",
        subject: "Private",
        threadId: "thr_contacts_private",
        to: ["private@contacts.example"]
      }),
      thread("thr_contacts_self_send", "Workspace recipient", "2026-08-24T12:04:00.000Z"),
      message({
        direction: "outbound",
        from: "support@contacts.example",
        id: "msg_contacts_self_send",
        mailboxId: "mbx_contacts_one",
        receivedAt: "2026-08-24T12:04:00.000Z",
        subject: "Workspace recipient",
        threadId: "thr_contacts_self_send",
        to: ["support@contacts.example", "private@contacts.example"]
      })
    ]);
  });

  it("lists outbound external recipients and keeps mailbox suggestions separate", async () => {
    const response = await sessionFetch("/api/contacts?search=pat&limit=5", firstCookie);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual([
      {
        email: "pat@example.net",
        id: "pat@example.net",
        lastContactAt: "2026-08-24T12:02:00.000Z",
        name: null,
        saved: false,
        source: "recent"
      }
    ]);

    for (const recipient of ["team@example.net", "quiet@example.net"]) {
      const recent = (await (
        await sessionFetch(`/api/contacts?search=${encodeURIComponent(recipient)}`, firstCookie)
      ).json()) as Array<{ email: string; source: string }>;
      expect(recent).toEqual([expect.objectContaining({ email: recipient, source: "recent" })]);
    }

    const inboundOnly = (await (
      await sessionFetch("/api/contacts?search=inbound-only", firstCookie)
    ).json()) as unknown[];
    expect(inboundOnly).toEqual([]);

    const directoryMailboxes = (await (
      await sessionFetch("/api/contacts?search=support", firstCookie)
    ).json()) as Array<{ email: string; source: string }>;
    expect(directoryMailboxes).toEqual([]);

    const mailboxSuggestions = (await (
      await sessionFetch("/api/contacts/suggestions?search=support", firstCookie)
    ).json()) as Array<{ email: string; source: string }>;
    expect(mailboxSuggestions).toEqual([
      expect.objectContaining({ email: "support@contacts.example", source: "mailbox" })
    ]);

    const inaccessibleMailbox = (await (
      await sessionFetch("/api/contacts/suggestions?search=private", firstCookie)
    ).json()) as unknown[];
    expect(inaccessibleMailbox).toEqual([]);

    const hidden = (await (
      await sessionFetch("/api/contacts?search=hidden", firstCookie)
    ).json()) as unknown[];
    expect(hidden).toEqual([]);

    const firstPage = (await (
      await sessionFetch("/api/contacts?limit=1&offset=0", firstCookie)
    ).json()) as Array<{ id: string }>;
    const secondPage = (await (
      await sessionFetch("/api/contacts?limit=1&offset=1", firstCookie)
    ).json()) as Array<{ id: string }>;
    expect(firstPage).toHaveLength(1);
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]?.id).not.toBe(firstPage[0]?.id);
  });

  it("keeps saved names and notes private to one signed-in person", async () => {
    const firstSave = await sessionFetch("/api/contacts/pat%40example.net", firstCookie, {
      body: JSON.stringify({ email: "PAT@example.net", name: "Pat One", notes: "Private one" }),
      headers: { "content-type": "application/json" },
      method: "PUT"
    });
    expect(firstSave.status, await firstSave.clone().text()).toBe(200);
    expect(await firstSave.json()).toMatchObject({
      contact: { email: "pat@example.net", name: "Pat One", notes: "Private one", saved: true }
    });

    const secondSave = await sessionFetch("/api/contacts/pat%40example.net", secondCookie, {
      body: JSON.stringify({ email: "pat@example.net", name: "Pat Two", notes: "Private two" }),
      headers: { "content-type": "application/json" },
      method: "PUT"
    });
    expect(secondSave.status, await secondSave.clone().text()).toBe(200);

    const firstDetail = await sessionFetch("/api/contacts/pat%40example.net", firstCookie);
    const secondDetail = await sessionFetch("/api/contacts/pat%40example.net", secondCookie);
    expect(await firstDetail.json()).toMatchObject({
      contact: { name: "Pat One", notes: "Private one" }
    });
    expect(await secondDetail.json()).toMatchObject({
      contact: { name: "Pat Two", notes: "Private two" }
    });
  });

  it("lists only exact accessible exchanges and keeps derived correspondents after deletion", async () => {
    const firstPage = (await (
      await sessionFetch("/api/contacts/pat%40example.net?limit=1", firstCookie)
    ).json()) as { conversations: Array<{ id: string }>; nextCursor: string | null };
    expect(firstPage.conversations).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = (await (
      await sessionFetch(
        `/api/contacts/pat%40example.net?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
        firstCookie
      )
    ).json()) as { conversations: Array<{ id: string }>; nextCursor: string | null };
    expect(secondPage.nextCursor).toBeNull();
    expect(
      [...firstPage.conversations, ...secondPage.conversations]
        .map((conversation) => conversation.id)
        .sort()
    ).toEqual(["msg_contacts_inbound", "msg_contacts_outbound"]);

    const removed = await sessionFetch("/api/contacts/pat%40example.net", firstCookie, {
      method: "DELETE"
    });
    expect(removed.status).toBe(204);
    const after = await sessionFetch("/api/contacts/pat%40example.net", firstCookie);
    expect(await after.json()).toMatchObject({
      contact: { email: "pat@example.net", name: null, notes: "", saved: false, source: "recent" }
    });
  });

  it("returns stable contact validation and not-found errors", async () => {
    const invalid = await sessionFetch("/api/contacts/not-an-email", firstCookie);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "CONTACT_INVALID" } });

    const mismatched = await sessionFetch("/api/contacts/pat%40example.net", firstCookie, {
      body: JSON.stringify({ email: "other@example.net", name: "Other", notes: "" }),
      headers: { "content-type": "application/json" },
      method: "PUT"
    });
    expect(mismatched.status).toBe(400);
    expect(await mismatched.json()).toMatchObject({ error: { code: "CONTACT_INVALID" } });

    const mailbox = await sessionFetch("/api/contacts/support%40contacts.example", firstCookie, {
      body: JSON.stringify({
        email: "support@contacts.example",
        name: "Support",
        notes: "Do not save"
      }),
      headers: { "content-type": "application/json" },
      method: "PUT"
    });
    expect(mailbox.status).toBe(400);
    expect(await mailbox.json()).toMatchObject({ error: { code: "CONTACT_INVALID" } });

    const missing = await sessionFetch("/api/contacts/missing%40example.net", firstCookie);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "CONTACT_NOT_FOUND" } });
  });
});

async function createUser(
  email: string,
  name: string
): Promise<{ cookie: string; userId: string }> {
  const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email, name, password: "contacts-test-password", rememberMe: false }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const user = await env.DB.prepare(`SELECT id FROM "user" WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (!user) throw new Error("Contact test user was not created.");
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

function thread(id: string, subject: string, timestamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, subject.toLowerCase(), timestamp, timestamp, timestamp);
}

function message(input: {
  bcc?: string[];
  cc?: string[];
  direction?: "inbound" | "outbound";
  from: string;
  id: string;
  mailboxId: string;
  receivedAt: string;
  subject: string;
  threadId: string;
  to: string[];
}): D1PreparedStatement {
  const direction = input.direction ?? "inbound";
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, references_json, received_at, sent_at, has_attachments,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '[]', ?, ?, 0, ?, ?)`
  ).bind(
    input.id,
    input.threadId,
    input.mailboxId,
    direction,
    direction === "outbound" ? "sent" : "inbox",
    input.from,
    JSON.stringify(input.to),
    JSON.stringify(input.cc ?? []),
    JSON.stringify(input.bcc ?? []),
    input.subject,
    input.subject,
    direction === "inbound" ? input.receivedAt : null,
    direction === "outbound" ? input.receivedAt : null,
    input.receivedAt,
    input.receivedAt
  );
}
