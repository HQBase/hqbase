import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { searchRoutes } from "../../../worker/features/search/routes";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
let cookie = "";
let userId = "";

describe("global search", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    ({ cookie, userId } = await createUser());
    const timestamp = "2026-08-24T14:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_global_search', 'search.example', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_global_search', 'team@search.example', 'dom_global_search', 'Team', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_global_hidden', 'hidden@search.example', 'dom_global_search', 'Hidden', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
         VALUES ('mbx_global_search', ?, 'manager', ?, ?, ?)`
      ).bind(userId, userId, timestamp, timestamp),
      thread("thr_global_search", "Launch plan", timestamp),
      message(
        "msg_global_search",
        "thr_global_search",
        "mbx_global_search",
        "Launch plan",
        timestamp
      ),
      thread("thr_global_hidden", "Hidden launch", timestamp),
      message(
        "msg_global_hidden",
        "thr_global_hidden",
        "mbx_global_hidden",
        "Hidden launch",
        timestamp
      ),
      env.DB.prepare(
        `INSERT INTO contacts (user_id, email, name, notes, created_at, updated_at)
         VALUES (?, 'lead@example.net', 'Launch lead', '', ?, ?)`
      ).bind(userId, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO drafts
         (id, principal_id, mailbox_id, from_address, to_json, cc_json, bcc_json, subject,
          text_body, html_body, version, created_at, updated_at)
         VALUES ('drf_global_search', ?, 'mbx_global_search', 'team@search.example',
          '["lead@example.net"]', '[]', '[]', 'Launch reply', 'Draft launch notes', '', 1, ?, ?)`
      ).bind(userId, timestamp, timestamp)
    ]);
  });

  it("groups only access-scoped conversations, contacts, and private drafts", async () => {
    const response = await searchRoutes.request(
      `${origin}/?q=launch&limit=5`,
      {
        headers: { cookie }
      },
      env
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const body = (await response.json()) as {
      contacts: Array<{ email: string }>;
      conversations: Array<{ id: string }>;
      drafts: Array<{ id: string }>;
    };

    expect(body.conversations.map((result) => result.id)).toEqual(["msg_global_search"]);
    expect(body.contacts.map((result) => result.email)).toEqual(["lead@example.net"]);
    expect(body.drafts.map((result) => result.id)).toEqual(["drf_global_search"]);
  });

  it("returns matching app destinations for the signed-in role", async () => {
    const response = await searchRoutes.request(
      `${origin}/?q=labels`,
      { headers: { cookie } },
      env
    );
    expect(response.status, await response.clone().text()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      destinations: [{ id: "labels", path: "/settings/labels" }]
    });
  });

  it("does not return workspace mailboxes as contacts", async () => {
    const response = await searchRoutes.request(
      `${origin}/?q=team&limit=5`,
      { headers: { cookie } },
      env
    );
    expect(response.status, await response.clone().text()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ contacts: [] });
  });
});

async function createUser(): Promise<{ cookie: string; userId: string }> {
  const email = "global-search@login.example";
  const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email,
        name: "Global Search",
        password: "global-search-test-password",
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
  if (!user) throw new Error("Global search test user was not created.");
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return { cookie: match[1], userId: user.id };
}

function thread(id: string, subject: string, timestamp: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, subject.toLowerCase(), timestamp, timestamp, timestamp);
}

function message(
  id: string,
  threadId: string,
  mailboxId: string,
  subject: string,
  timestamp: string
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, references_json, received_at, has_attachments, created_at, updated_at)
     VALUES (?, ?, ?, 'inbound', 'inbox', 'lead@example.net', '["team@search.example"]',
      '[]', '[]', ?, ?, ?, '[]', ?, 0, ?, ?)`
  ).bind(id, threadId, mailboxId, subject, subject, subject, timestamp, timestamp, timestamp);
}
