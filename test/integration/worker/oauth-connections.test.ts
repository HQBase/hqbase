import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";

describe("OAuth connections", () => {
  let first: { cookie: string; sessionId: string; userId: string };
  let second: { cookie: string; sessionId: string; userId: string };

  beforeAll(async () => {
    await applyCurrentMigrations();
    first = await createUser("connections-one@login.example");
    second = await createUser("connections-two@login.example");

    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO oauthClient (id, clientId, name, redirectUris, createdAt, updatedAt)
         VALUES ('oauth_client_row_connections', 'client_connections', 'Mail helper', '[]', ?, ?)`
      ).bind(now, now),
      ...[first, second].flatMap((person, index) => [
        env.DB.prepare(
          `INSERT INTO oauthConsent
           (id, clientId, userId, scopes, resources, createdAt, updatedAt)
           VALUES (?, 'client_connections', ?, ?, ?, ?, ?)`
        ).bind(
          `consent_connections_${index}`,
          person.userId,
          JSON.stringify(["mail:read", "mail:send", "offline_access"]),
          JSON.stringify([`${origin}/api/v2`]),
          now,
          now
        ),
        env.DB.prepare(
          `INSERT INTO oauthRefreshToken
           (id, token, clientId, sessionId, userId, expiresAt, createdAt, scopes, resources)
           VALUES (?, ?, 'client_connections', ?, ?, ?, ?, ?, ?)`
        ).bind(
          `refresh_connections_${index}`,
          `refresh-token-${index}`,
          person.sessionId,
          person.userId,
          expires,
          now,
          JSON.stringify(["mail:read", "mail:send", "offline_access"]),
          JSON.stringify([`${origin}/api/v2`])
        ),
        env.DB.prepare(
          `INSERT INTO oauthAccessToken
           (id, token, clientId, sessionId, userId, expiresAt, createdAt, scopes, resources)
           VALUES (?, ?, 'client_connections', ?, ?, ?, ?, ?, ?)`
        ).bind(
          `access_connections_${index}`,
          `access-token-${index}`,
          person.sessionId,
          person.userId,
          expires,
          now,
          JSON.stringify(["mail:read", "mail:send"]),
          JSON.stringify([`${origin}/api/v2`])
        )
      ])
    ]);
  });

  it("lists and fully revokes only the signed-in person's connection", async () => {
    const list = await SELF.fetch(`${origin}/api/oauth-connections`, {
      headers: { origin, cookie: first.cookie }
    });
    expect(list.status, await list.clone().text()).toBe(200);
    await expect(list.json()).resolves.toEqual({
      connections: [
        expect.objectContaining({
          clientId: "client_connections",
          name: "Mail helper",
          resources: [`${origin}/api/v2`],
          scopes: ["mail:read", "mail:send", "offline_access"]
        })
      ]
    });

    const revoked = await SELF.fetch(`${origin}/api/oauth-connections/client_connections`, {
      headers: { origin, cookie: first.cookie },
      method: "DELETE"
    });
    expect(revoked.status, await revoked.clone().text()).toBe(204);

    for (const table of ["oauthConsent", "oauthAccessToken", "oauthRefreshToken"]) {
      const firstCount = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM ${table} WHERE clientId = ? AND userId = ?`
      )
        .bind("client_connections", first.userId)
        .first<{ count: number }>();
      const secondCount = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM ${table} WHERE clientId = ? AND userId = ?`
      )
        .bind("client_connections", second.userId)
        .first<{ count: number }>();
      expect(firstCount?.count).toBe(0);
      expect(secondCount?.count).toBe(1);
    }

    const audit = await env.DB.prepare(
      `SELECT action, actor_id, resource_id FROM audit_events
       WHERE action = 'oauth.connection.revoke' AND actor_id = ?`
    )
      .bind(first.userId)
      .first<{ action: string; actor_id: string; resource_id: string }>();
    expect(audit).toEqual({
      action: "oauth.connection.revoke",
      actor_id: first.userId,
      resource_id: "client_connections"
    });
  });
});

async function createUser(email: string): Promise<{
  cookie: string;
  sessionId: string;
  userId: string;
}> {
  const response = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email, name: email, password: "password-123456", rememberMe: false }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const user = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  const session = await env.DB.prepare('SELECT id FROM "session" WHERE userId = ?')
    .bind(user?.id)
    .first<{ id: string }>();
  if (!user || !session) throw new Error("Expected OAuth connection test user and session.");
  return { cookie: sessionCookie(response), sessionId: session.id, userId: user.id };
}

function sessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/u);
  if (!match?.[1]) throw new Error("Expected session cookie.");
  return match[1];
}
