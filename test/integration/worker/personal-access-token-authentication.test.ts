import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import {
  generatePersonalAccessToken,
  hashPersonalAccessToken
} from "../../../worker/auth/personal-access-token-secret";
import type { WorkspaceRole } from "../../../worker/lib/validation";
import { assertSecretSafeAbsent } from "../../helpers/secret-safe-assertions";
import { applyCurrentMigrations } from "./current-migrations";
import { tokenRow } from "./mail-api-token-fixture";

const origin = "https://hqbase.test";
const apiResource = `${origin}/api/v1`;
const oauthBearer = "hqb_access_pat-shared-rate-limit";
const password = "personal-access-token-password";

type Actor = {
  id: string;
  sessionId: string;
  cookie: string;
  role: WorkspaceRole;
  bearer: string;
  tokenId: string;
  tokenHash: string;
};

const actors = {} as Record<"owner" | "admin" | "member", Actor>;
let revokedBearer = "";
let revokedHash = "";

describe("Mail API personal access token authentication", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    actors.owner = await createActor("owner");
    actors.admin = await createActor("admin");
    actors.member = await createActor("member");
    await createMailFixtures();
    await createOAuthFixture();

    const revoked = await generatePersonalAccessToken();
    revokedBearer = revoked.token;
    revokedHash = revoked.tokenHash;
    await insertPat(
      "pat_http_revoked",
      actors.member.id,
      revoked.tokenHash,
      revoked.tokenSuffix,
      new Date().toISOString()
    );
  });

  it("uses owner, admin, and member PATs for read, write, and send operations", async () => {
    for (const role of ["owner", "admin", "member"] as const) {
      const actor = actors[role];
      const read = await patFetch(actor.bearer, "/api/v1/messages/msg_pat_allowed");
      expect(read.status, role).toBe(200);

      const write = await patFetch(actor.bearer, "/api/v1/messages/msg_pat_allowed/read", {
        method: "POST"
      });
      expect(write.status, role).toBe(200);

      const send = await patFetch(actor.bearer, "/api/v1/drafts", {
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      expect(send.status, role).toBe(201);
      expect(send.headers.get("www-authenticate")).toBeNull();
    }
  });

  it("applies current mailbox and unassigned-mail access to each role", async () => {
    for (const role of ["admin", "member"] as const) {
      await expect(
        patFetch(actors[role].bearer, "/api/v1/messages/msg_pat_foreign")
      ).resolves.toMatchObject({ status: 403 });
      await expect(
        patFetch(actors[role].bearer, "/api/v1/messages/msg_pat_unassigned")
      ).resolves.toMatchObject({ status: 403 });
    }

    await expect(
      patFetch(actors.owner.bearer, "/api/v1/messages/msg_pat_foreign")
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      patFetch(actors.owner.bearer, "/api/v1/messages/msg_pat_unassigned")
    ).resolves.toMatchObject({ status: 200 });
  });

  it("uses live role and mailbox-grant state", async () => {
    await env.DB.prepare('UPDATE "user" SET role = ? WHERE id = ?')
      .bind("member", actors.owner.id)
      .run();
    try {
      await expect(
        patFetch(actors.owner.bearer, "/api/v1/messages/msg_pat_foreign")
      ).resolves.toMatchObject({ status: 403 });
      await expect(
        patFetch(actors.owner.bearer, "/api/v1/messages/msg_pat_unassigned")
      ).resolves.toMatchObject({ status: 403 });
    } finally {
      await env.DB.prepare('UPDATE "user" SET role = ? WHERE id = ?')
        .bind("owner", actors.owner.id)
        .run();
    }

    await env.DB.prepare(
      "DELETE FROM mailbox_grants WHERE mailbox_id = 'mbx_pat_allowed' AND user_id = ?"
    )
      .bind(actors.member.id)
      .run();
    try {
      await expect(
        patFetch(actors.member.bearer, "/api/v1/messages/msg_pat_allowed")
      ).resolves.toMatchObject({ status: 403 });
    } finally {
      await insertGrant(actors.member.id);
    }
  });

  it("does not depend on a live web session", async () => {
    await env.DB.prepare('UPDATE "session" SET expiresAt = ? WHERE id = ?')
      .bind("2026-01-01T00:00:00.000Z", actors.member.sessionId)
      .run();

    const expiredSession = await SELF.fetch(`${origin}/api/v1/messages/msg_pat_allowed`, {
      headers: { cookie: actors.member.cookie }
    });
    expect(expiredSession.status).toBe(401);
    await expect(
      patFetch(actors.member.bearer, "/api/v1/messages/msg_pat_allowed")
    ).resolves.toMatchObject({ status: 200 });
  });

  it("stays active after an ordinary password reset", async () => {
    const requested = await SELF.fetch(`${origin}/api/auth/request-password-reset`, {
      body: JSON.stringify({
        email: "pat-admin@example.com",
        redirectTo: `${origin}/reset-password`
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    });
    expect(requested.status).toBe(200);
    const verification = await env.DB.prepare(
      `SELECT identifier FROM verification
       WHERE value = ? AND identifier LIKE 'reset-password:%'
       ORDER BY expiresAt DESC LIMIT 1`
    )
      .bind(actors.admin.id)
      .first<{ identifier: string }>();
    const resetToken = verification?.identifier.replace("reset-password:", "");
    if (!resetToken) throw new Error("Expected a password-reset verification row.");

    const reset = await SELF.fetch(`${origin}/api/auth/reset-password`, {
      body: JSON.stringify({
        newPassword: "personal-access-token-password-next",
        token: resetToken
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    });
    expect(reset.status, await reset.clone().text()).toBe(200);
    await expect(
      patFetch(actors.admin.bearer, "/api/v1/messages/msg_pat_allowed")
    ).resolves.toMatchObject({ status: 200 });
  });

  it("keeps current send validation for PAT callers", async () => {
    const response = await patFetch(actors.owner.bearer, "/api/v1/send", {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("shares send and reply limits by user across PAT, session, and OAuth", async () => {
    await env.DB.prepare(
      "DELETE FROM rate_limits WHERE scope IN ('mail.send', 'mail.reply')"
    ).run();
    for (const path of ["/api/v1/send", "/api/v1/reply"]) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        expect(
          (await invalidAction(path, { authorization: `Bearer ${actors.owner.bearer}` })).status
        ).toBe(400);
        expect((await invalidAction(path, { cookie: actors.owner.cookie })).status).toBe(400);
        expect((await invalidAction(path, { authorization: `Bearer ${oauthBearer}` })).status).toBe(
          400
        );
      }
      const limited = await invalidAction(path, {
        authorization: `Bearer ${actors.owner.bearer}`
      });
      expect(limited.status).toBe(429);
      await expect(limited.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
    }
  });

  it("does not fall back to a valid cookie when a PAT header is malformed", async () => {
    const rejected = await SELF.fetch(`${origin}/api/v1/messages/msg_pat_allowed`, {
      headers: {
        authorization: "Bearer hqb_pat_",
        cookie: actors.owner.cookie
      }
    });
    expect(rejected.status).toBe(401);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "INVALID_PERSONAL_ACCESS_TOKEN" }
    });

    const accepted = await SELF.fetch(`${origin}/api/v1/messages/msg_pat_allowed`, {
      headers: { cookie: actors.owner.cookie }
    });
    expect(accepted.status).toBe(200);
  });

  it("selects PAT authentication only for bearer values with the PAT prefix", async () => {
    const nonCanonical = `hqb_pat_${"_".repeat(43)}`;
    for (const authorization of ["Bearer hqb_pat_", `Bearer ${nonCanonical}`]) {
      const response = await authorizationFetch(authorization);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_PERSONAL_ACCESS_TOKEN" }
      });
    }

    const unknown = await generatePersonalAccessToken();
    const unknownResponse = await authorizationFetch(`Bearer ${unknown.token}`);
    expect(unknownResponse.status).toBe(401);
    await expect(unknownResponse.json()).resolves.toMatchObject({
      error: { code: "INVALID_PERSONAL_ACCESS_TOKEN" }
    });

    for (const authorization of [
      "Bearer hqb_access_unknown",
      "Basic hqb_pat_example",
      "Bearer",
      "Bearer:hqb_pat_example"
    ]) {
      const response = await authorizationFetch(authorization);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_OAUTH_TOKEN" }
      });
    }
  });

  it("keeps selected D1 failures as internal errors", async () => {
    await env.DB.prepare(
      "ALTER TABLE personal_access_tokens RENAME TO personal_access_tokens_unavailable"
    ).run();
    try {
      const response = await patFetch(actors.owner.bearer, "/api/v1/messages/msg_pat_allowed");
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    } finally {
      await env.DB.prepare(
        "ALTER TABLE personal_access_tokens_unavailable RENAME TO personal_access_tokens"
      ).run();
    }
  });

  it("returns one generic challenge for malformed, unknown, and revoked PATs", async () => {
    const unknown = await generatePersonalAccessToken();
    const malformed = "hqb_pat_";
    const cases = [
      { bearer: malformed, tokenHash: await hashPersonalAccessToken(malformed) },
      { bearer: unknown.token, tokenHash: unknown.tokenHash },
      { bearer: revokedBearer, tokenHash: revokedHash }
    ];

    for (const value of cases) {
      const authorizationHeader = `Bearer ${value.bearer}`;
      const rejected = await SELF.fetch(`${origin}/api/v1/send`, {
        body: JSON.stringify({}),
        headers: { authorization: authorizationHeader, "content-type": "application/json" },
        method: "POST"
      });
      expect(rejected.status).toBe(401);
      const body = (await rejected.json()) as Record<string, unknown>;
      const challenge = rejected.headers.get("www-authenticate") ?? "";
      assertSecretSafeAbsent(
        [body, challenge],
        [value.bearer, value.tokenHash, authorizationHeader]
      );
      const error = body.error as Record<string, unknown> | undefined;
      expect(
        Object.keys(body).length === 1 &&
          error !== undefined &&
          Object.keys(error).length === 2 &&
          error.code === "INVALID_PERSONAL_ACCESS_TOKEN" &&
          error.message === "Bearer token is invalid or inactive."
      ).toBe(true);
      expect(
        challenge.includes(
          `resource_metadata="${origin}/.well-known/oauth-protected-resource/api/v1"`
        ) &&
          challenge.includes('scope="mail:send"') &&
          challenge.includes('error="invalid_token"')
      ).toBe(true);
    }
  });
});

async function createActor(role: WorkspaceRole): Promise<Actor> {
  const email = `pat-${role}@example.com`;
  const signUp = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email, name: `PAT ${role}`, password, rememberMe: false }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(signUp.status, await signUp.clone().text()).toBe(200);
  const cookie = extractSessionCookie(signUp);
  const user = await env.DB.prepare(
    `SELECT u.id, s.id AS sessionId FROM "user" u
     JOIN "session" s ON s.userId = u.id
     WHERE u.email = ? ORDER BY s.createdAt DESC LIMIT 1`
  )
    .bind(email)
    .first<{ id: string; sessionId: string }>();
  if (!user) throw new Error("Expected a PAT authentication user.");
  await env.DB.prepare('UPDATE "user" SET role = ? WHERE id = ?').bind(role, user.id).run();

  const generated = await generatePersonalAccessToken();
  const tokenId = `pat_http_${role}`;
  await insertPat(tokenId, user.id, generated.tokenHash, generated.tokenSuffix, null);
  return {
    id: user.id,
    sessionId: user.sessionId,
    cookie,
    role,
    bearer: generated.token,
    tokenId,
    tokenHash: generated.tokenHash
  };
}

async function insertPat(
  id: string,
  userId: string,
  tokenHash: string,
  tokenSuffix: string,
  revokedAt: string | null
): Promise<void> {
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO personal_access_tokens
     (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
     VALUES (?, ?, 'Mail API PAT', ?, ?, ?, NULL, ?)`
  )
    .bind(id, userId, tokenHash, tokenSuffix, timestamp, revokedAt)
    .run();
}

async function createMailFixtures(): Promise<void> {
  const timestamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES
         ('mbx_pat_allowed', 'allowed@pat.example', 'Allowed', 1, ?, ?),
         ('mbx_pat_foreign', 'foreign@pat.example', 'Foreign', 1, ?, ?)`
    ).bind(timestamp, timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO mail_domains
       (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
       VALUES ('dom_pat', 'pat.example', 'ready', 'ready', 'ready', 1, ?, ?)`
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO mailbox_addresses
       (id, mailbox_id, mail_domain_id, local_part, address, display_name,
        receive_enabled, send_enabled, is_primary, created_at, updated_at)
       VALUES
         ('addr_pat_allowed', 'mbx_pat_allowed', 'dom_pat', 'allowed', 'allowed@pat.example',
          'Allowed', 1, 1, 1, ?, ?),
         ('addr_pat_foreign', 'mbx_pat_foreign', 'dom_pat', 'foreign', 'foreign@pat.example',
          'Foreign', 1, 1, 1, ?, ?)`
    ).bind(timestamp, timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES
         ('thr_pat_allowed', 'allowed', ?, ?, ?),
         ('thr_pat_foreign', 'foreign', ?, ?, ?),
         ('thr_pat_unassigned', 'unassigned', ?, ?, ?)`
    ).bind(
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp
    ),
    messageRow("msg_pat_allowed", "thr_pat_allowed", "mbx_pat_allowed", 0, timestamp),
    messageRow("msg_pat_foreign", "thr_pat_foreign", "mbx_pat_foreign", 0, timestamp),
    messageRow("msg_pat_unassigned", "thr_pat_unassigned", null, 1, timestamp)
  ]);
  await insertGrant(actors.admin.id);
  await insertGrant(actors.member.id);
}

function messageRow(
  id: string,
  threadId: string,
  mailboxId: string | null,
  isUnassigned: 0 | 1,
  timestamp: string
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, is_unassigned, direction, folder, from_address,
      to_json, cc_json, bcc_json, subject, snippet, text_body, message_id, dedupe_key,
      in_reply_to, references_json, received_at, sent_at, read_at, has_attachments,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, 'inbound', 'inbox', 'sender@example.net', '[]', '[]', '[]',
             ?, 'Body', 'Body', ?, ?, NULL, '[]', ?, NULL, NULL, 0, ?, ?)`
  ).bind(
    id,
    threadId,
    mailboxId,
    isUnassigned,
    id,
    `<${id}@example.net>`,
    `dedupe-${id}`,
    timestamp,
    timestamp,
    timestamp
  );
}

async function insertGrant(userId: string): Promise<void> {
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO mailbox_grants
     (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
     VALUES ('mbx_pat_allowed', ?, 'agent', ?, ?, ?)`
  )
    .bind(userId, actors.owner.id, timestamp, timestamp)
    .run();
}

async function createOAuthFixture(): Promise<void> {
  const timestamp = new Date().toISOString();
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO oauthClient
       (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
       VALUES ('client_row_pat_http', 'client_pat_http', 0, '[]', 1, 1, ?, ?)`
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO oauthConsent
       (id, clientId, userId, scopes, resources, createdAt, updatedAt)
       VALUES ('consent_pat_http', 'client_pat_http', ?, ?, ?, ?, ?)`
    ).bind(
      actors.owner.id,
      JSON.stringify(["mail:read", "mail:write", "mail:send"]),
      JSON.stringify([apiResource]),
      timestamp,
      timestamp
    ),
    await tokenRow(
      env.DB,
      "tok_pat_http",
      oauthBearer,
      "client_pat_http",
      actors.owner.sessionId,
      actors.owner.id,
      future,
      ["mail:read", "mail:write", "mail:send"],
      apiResource
    )
  ]);
}

function patFetch(bearer: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${bearer}`);
  return SELF.fetch(`${origin}${path}`, { ...init, headers });
}

function authorizationFetch(authorization: string): Promise<Response> {
  return SELF.fetch(`${origin}/api/v1/messages/msg_pat_allowed`, {
    headers: { authorization, cookie: actors.owner.cookie }
  });
}

function invalidAction(path: string, authentication: HeadersInit): Promise<Response> {
  return SELF.fetch(`${origin}${path}`, {
    body: JSON.stringify({}),
    headers: {
      ...Object.fromEntries(new Headers(authentication)),
      "content-type": "application/json"
    },
    method: "POST"
  });
}

function extractSessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}
