import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { assertSecretSafeAbsent } from "../../helpers/secret-safe-assertions";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
const users = {
  owner: { id: "", cookie: "", role: "owner" },
  secondOwner: { id: "", cookie: "", role: "owner" },
  admin: { id: "", cookie: "", role: "admin" },
  member: { id: "", cookie: "", role: "member" }
} as const;

describe("personal access token management API", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    await createSessionUser("owner", "pat-owner@example.com");
    await createSessionUser("secondOwner", "pat-second-owner@example.com");
    await createSessionUser("admin", "pat-admin@example.com");
    await createSessionUser("member", "pat-member@example.com");
  });

  beforeEach(async () => {
    await env.DB.prepare(
      "DELETE FROM audit_events WHERE action LIKE 'personal_access_token.%'"
    ).run();
    await env.DB.prepare("DELETE FROM personal_access_tokens").run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE scope = 'pat.create'").run();
    const recent = new Date().toISOString();
    for (const user of Object.values(users)) {
      await env.DB.prepare('UPDATE "user" SET role = ? WHERE id = ?')
        .bind(user.role, user.id)
        .run();
      await env.DB.prepare('UPDATE "session" SET createdAt = ? WHERE userId = ?')
        .bind(recent, user.id)
        .run();
    }
  });

  it("creates, lists, and revokes tokens for each current role", async () => {
    const ownerToken = await createThroughApi(users.owner.cookie, "Owner automation");
    const secondOwnerToken = await createThroughApi(
      users.secondOwner.cookie,
      "Second owner automation"
    );
    const adminToken = await createThroughApi(users.admin.cookie, "Admin automation");
    const memberToken = await createThroughApi(users.member.cookie, "Member automation");

    await setCreatedAt(ownerToken.id, "2026-08-20T18:00:04.000Z");
    await setCreatedAt(secondOwnerToken.id, "2026-08-20T18:00:03.000Z");
    await setCreatedAt(adminToken.id, "2026-08-20T18:00:02.000Z");
    await setCreatedAt(memberToken.id, "2026-08-20T18:00:01.000Z");
    await insertPat("pat_expired_http", users.admin.id, "Expired", {
      expiresAt: "2026-08-19T18:00:00.000Z"
    });
    await insertPat("pat_revoked_http", users.member.id, "Revoked", {
      revokedAt: "2026-08-20T17:00:00.000Z"
    });

    const ownerList = await listThroughApi(users.owner.cookie);
    expect(ownerList.response.headers.get("cache-control")).toBe("no-store");
    expect(ownerList.tokens.map(({ id }) => id)).toEqual([
      ownerToken.id,
      secondOwnerToken.id,
      adminToken.id,
      memberToken.id
    ]);
    expect(Object.keys(ownerList.tokens[0] ?? {})).toEqual([
      "id",
      "userId",
      "ownerName",
      "name",
      "tokenSuffix",
      "createdAt",
      "expiresAt"
    ]);

    const adminList = await listThroughApi(users.admin.cookie);
    expect(adminList.tokens.map(({ id }) => id)).toEqual([adminToken.id]);
    const memberList = await listThroughApi(users.member.cookie);
    expect(memberList.tokens.map(({ id }) => id)).toEqual([memberToken.id]);

    const foreignAdmin = await SELF.fetch(`${origin}/api/personal-access-tokens/${ownerToken.id}`, {
      headers: { cookie: users.admin.cookie },
      method: "DELETE"
    });
    expect(foreignAdmin.status).toBe(404);
    expect(foreignAdmin.headers.get("cache-control")).toBe("no-store");
    expect(await auditCount(ownerToken.id, "personal_access_token.revoke")).toBe(0);

    const foreignMember = await SELF.fetch(
      `${origin}/api/personal-access-tokens/${adminToken.id}`,
      { headers: { cookie: users.member.cookie }, method: "DELETE" }
    );
    expect(foreignMember.status).toBe(404);
    expect(await auditCount(adminToken.id, "personal_access_token.revoke")).toBe(0);

    const revoked = await SELF.fetch(`${origin}/api/personal-access-tokens/${adminToken.id}`, {
      headers: { cookie: users.owner.cookie },
      method: "DELETE"
    });
    expect(revoked.status).toBe(204);
    expect(revoked.headers.get("cache-control")).toBe("no-store");
    const repeated = await SELF.fetch(`${origin}/api/personal-access-tokens/${adminToken.id}`, {
      headers: { cookie: users.owner.cookie },
      method: "DELETE"
    });
    expect(repeated.status).toBe(204);
    expect(await auditCount(adminToken.id, "personal_access_token.revoke")).toBe(1);

    const unknown = await SELF.fetch(`${origin}/api/personal-access-tokens/pat_unknown`, {
      headers: { cookie: users.owner.cookie },
      method: "DELETE"
    });
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toEqual({
      error: {
        code: "PERSONAL_ACCESS_TOKEN_NOT_FOUND",
        message: "Personal access token not found."
      }
    });
  });

  it("uses the user's current role after an owner is demoted", async () => {
    const own = await createThroughApi(users.owner.cookie, "Demoted owner token");
    const foreign = await createThroughApi(users.secondOwner.cookie, "Other owner token");
    const demoted = await SELF.fetch(`${origin}/api/users/${users.owner.id}`, {
      body: JSON.stringify({ role: "admin" }),
      headers: {
        "content-type": "application/json",
        cookie: users.secondOwner.cookie,
        origin
      },
      method: "PATCH"
    });
    expect(demoted.status, await demoted.clone().text()).toBe(200);

    const list = await listThroughApi(users.owner.cookie);
    expect(list.tokens.map(({ id }) => id)).toEqual([own.id]);
    const rejected = await SELF.fetch(`${origin}/api/personal-access-tokens/${foreign.id}`, {
      headers: { cookie: users.owner.cookie },
      method: "DELETE"
    });
    expect(rejected.status).toBe(404);
    expect(await auditCount(foreign.id, "personal_access_token.revoke")).toBe(0);
    const stored = await env.DB.prepare(
      "SELECT revoked_at AS revokedAt FROM personal_access_tokens WHERE id = ?"
    )
      .bind(foreign.id)
      .first<{ revokedAt: string | null }>();
    expect(stored?.revokedAt).toBeNull();
  });

  it("maps malformed JSON to the PAT input error", async () => {
    const response = await SELF.fetch(`${origin}/api/personal-access-tokens`, {
      body: "{",
      headers: {
        "content-type": "application/json",
        cookie: users.member.cookie,
        origin
      },
      method: "POST"
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_PERSONAL_ACCESS_TOKEN",
        message: "Personal access token input is invalid."
      }
    });
  });

  it("requires a recent web session only for creation", async () => {
    await insertPat("pat_stale_session", users.member.id, "Stale session token");
    await env.DB.prepare('UPDATE "session" SET createdAt = ? WHERE userId = ?')
      .bind("2026-01-01T00:00:00.000Z", users.member.id)
      .run();

    const list = await SELF.fetch(`${origin}/api/personal-access-tokens`, {
      headers: { cookie: users.member.cookie }
    });
    expect(list.status).toBe(200);
    const revoke = await SELF.fetch(`${origin}/api/personal-access-tokens/pat_stale_session`, {
      headers: { cookie: users.member.cookie },
      method: "DELETE"
    });
    expect(revoke.status).toBe(204);
    const create = await SELF.fetch(`${origin}/api/personal-access-tokens`, {
      body: JSON.stringify({ name: "Stale", expiresAt: null }),
      headers: {
        "content-type": "application/json",
        cookie: users.member.cookie,
        origin
      },
      method: "POST"
    });
    expect(create.status).toBe(403);
    await expect(create.json()).resolves.toMatchObject({
      error: { code: "RECENT_AUTH_REQUIRED" }
    });
  });

  it("accepts only web sessions on management routes", async () => {
    const created = await createThroughApi(users.owner.cookie, "Bearer boundary");
    const stored = await env.DB.prepare(
      "SELECT token_hash AS tokenHash FROM personal_access_tokens WHERE id = ?"
    )
      .bind(created.id)
      .first<{ tokenHash: string }>();
    if (!stored) throw new Error("Expected the created PAT row.");
    const authorization = `Bearer ${created.token}`;
    const serializedCreate = JSON.stringify({ name: "Bearer boundary", expiresAt: null });

    for (const header of [authorization, "Bearer hqb_access_example"]) {
      for (const [method, path] of [
        ["GET", "/api/personal-access-tokens"],
        ["POST", "/api/personal-access-tokens"],
        ["DELETE", `/api/personal-access-tokens/${created.id}`]
      ] as const) {
        const response = await SELF.fetch(`${origin}${path}`, {
          ...(method === "POST" ? { body: serializedCreate } : {}),
          headers: {
            authorization: header,
            ...(method === "POST" ? { "content-type": "application/json", origin } : {})
          },
          method
        });
        expect(response.status).toBe(401);
        const body = await response.text();
        assertSecretSafeAbsent(body, [
          created.token,
          stored.tokenHash,
          authorization,
          serializedCreate
        ]);
      }
    }
  });

  it("allows only one concurrent create to claim the tenth active slot", async () => {
    for (let index = 0; index < 9; index += 1) {
      await insertPat(`pat_concurrent_${index}`, users.owner.id, `Existing ${index}`);
    }
    const request = (name: string) =>
      SELF.fetch(`${origin}/api/personal-access-tokens`, {
        body: JSON.stringify({ name, expiresAt: null }),
        headers: {
          "content-type": "application/json",
          cookie: users.owner.cookie,
          origin
        },
        method: "POST"
      });
    const responses = await Promise.all([request("Concurrent A"), request("Concurrent B")]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      if (response.status === 201) {
        const body = (await response.json()) as {
          personalAccessToken: { id: string; name: string };
          token: string;
        };
        expect(/^hqb_pat_[A-Za-z0-9_-]{43}$/u.test(body.token)).toBe(true);
        expect(["Concurrent A", "Concurrent B"]).toContain(body.personalAccessToken.name);
      }
    }

    expect(
      await countRows(
        `SELECT COUNT(*) AS count FROM personal_access_tokens
         WHERE user_id = '${users.owner.id}' AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
    ).toBe(10);
    const concurrentRows = await env.DB.prepare(
      `SELECT id, name FROM personal_access_tokens
       WHERE name IN ('Concurrent A', 'Concurrent B')`
    ).all<{ id: string; name: string }>();
    expect(concurrentRows.results).toHaveLength(1);
    expect(
      await auditCount(concurrentRows.results[0]?.id ?? "", "personal_access_token.create")
    ).toBe(1);
  });

  it("limits create attempts independently by signed-in user", async () => {
    const invalidAttempt = () =>
      SELF.fetch(`${origin}/api/personal-access-tokens`, {
        body: JSON.stringify({ name: "", expiresAt: null }),
        headers: {
          "content-type": "application/json",
          cookie: users.admin.cookie,
          origin
        },
        method: "POST"
      });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await invalidAttempt();
      expect(response.status).toBe(400);
    }
    const limited = await invalidAttempt();
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });

    const otherUser = await SELF.fetch(`${origin}/api/personal-access-tokens`, {
      body: JSON.stringify({ name: "Independent limit", expiresAt: null }),
      headers: {
        "content-type": "application/json",
        cookie: users.member.cookie,
        origin
      },
      method: "POST"
    });
    expect(otherUser.status).toBe(201);
  });
});

async function createSessionUser(key: keyof typeof users, email: string): Promise<void> {
  const response = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email,
        name: `PAT ${key}`,
        password: "test-password-123",
        rememberMe: false
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  const cookie = extractSessionCookie(response);
  Object.assign(users[key], { id: body.user.id, cookie });
  await env.DB.prepare('UPDATE "user" SET role = ? WHERE id = ?')
    .bind(users[key].role, body.user.id)
    .run();
}

async function createThroughApi(cookie: string, name: string) {
  const response = await SELF.fetch(`${origin}/api/personal-access-tokens`, {
    body: JSON.stringify({ name, expiresAt: null }),
    headers: { "content-type": "application/json", cookie, origin },
    method: "POST"
  });
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = (await response.json()) as {
    personalAccessToken: Record<string, unknown> & { id: string; name: string };
    token: string;
  };
  expect(/^hqb_pat_[A-Za-z0-9_-]{43}$/u.test(body.token)).toBe(true);
  expect(body.personalAccessToken.name).toBe(name);
  return { id: body.personalAccessToken.id, token: body.token };
}

async function listThroughApi(cookie: string) {
  const response = await SELF.fetch(`${origin}/api/personal-access-tokens`, {
    headers: { cookie }
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    personalAccessTokens: Array<Record<string, unknown> & { id: string }>;
  };
  return { response, tokens: body.personalAccessTokens };
}

async function insertPat(
  id: string,
  userId: string,
  name: string,
  options: { expiresAt?: string | null; revokedAt?: string | null } = {}
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO personal_access_tokens
     (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, 'a1B2', '2026-08-20T18:00:00.000Z', ?, ?)`
  )
    .bind(
      id,
      userId,
      name,
      id.padEnd(43, "A").slice(0, 43),
      options.expiresAt ?? null,
      options.revokedAt ?? null
    )
    .run();
}

async function setCreatedAt(id: string, createdAt: string): Promise<void> {
  await env.DB.prepare("UPDATE personal_access_tokens SET created_at = ? WHERE id = ?")
    .bind(createdAt, id)
    .run();
}

async function auditCount(resourceId: string, action: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = ?"
  )
    .bind(resourceId, action)
    .first<{ count: number }>();
  return row?.count ?? -1;
}

async function countRows(query: string): Promise<number> {
  const row = await env.DB.prepare(query).first<{ count: number }>();
  return row?.count ?? -1;
}

function extractSessionCookie(response: Response): string {
  const cookie = (response.headers.get("set-cookie") ?? "").match(
    /(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/u
  )?.[1];
  if (!cookie) throw new Error("Session cookie was not returned.");
  return cookie;
}
