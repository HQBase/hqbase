import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import mcpMigration from "../../../migrations/0006_mcp_oauth.sql?raw";
import { hashOAuthToken } from "../../../worker/auth/oauth-token";

const origin = "https://hqbase.test";
const accessToken = "hqb_access_mcp-access-token";

describe("MCP server", () => {
  beforeAll(async () => {
    await applyMigration(initialMigration);
    await applyMigration(mcpMigration);
    const now = new Date();
    const storedAccessToken = await hashOAuthToken("mcp-access-token");
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR REPLACE INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
         VALUES (?, ?, ?, 1, ?, ?, 'owner', 0)`
      ).bind("usr_mcp", "MCP Owner", "mcp@example.com", now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT OR REPLACE INTO "session"
         (id, expiresAt, token, createdAt, updatedAt, userId)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        "ses_mcp",
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        "session-token-mcp",
        now.toISOString(),
        now.toISOString(),
        "usr_mcp"
      ),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('oc_mcp', 'client_mcp', 0, ?, 1, 1, ?, ?)`
      ).bind(
        JSON.stringify(["https://client.example/callback"]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, createdAt, updatedAt)
         VALUES ('consent_mcp', 'client_mcp', 'usr_mcp', ?, ?, ?)`
      ).bind(
        JSON.stringify(["mail:read", "mail:write", "mail:send"]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthAccessToken
         (id, token, clientId, sessionId, userId, expiresAt, createdAt, scopes)
         VALUES ('access_mcp', ?, 'client_mcp', 'ses_mcp', 'usr_mcp', ?, ?, ?)`
      ).bind(
        storedAccessToken,
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        now.toISOString(),
        JSON.stringify(["mail:read", "mail:write", "mail:send"])
      )
    ]);
  });

  it("publishes OAuth protected-resource and authorization-server metadata", async () => {
    const protectedResource = await SELF.fetch(
      `${origin}/.well-known/oauth-protected-resource/mcp`
    );
    expect(protectedResource.status).toBe(200);
    await expect(protectedResource.json()).resolves.toMatchObject({
      resource: `${origin}/mcp`,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: ["mail:read", "mail:write", "mail:send", "offline_access"]
    });

    const authorizationServer = await SELF.fetch(
      `${origin}/.well-known/oauth-authorization-server/api/auth`
    );
    expect(authorizationServer.status).toBe(200);
    await expect(authorizationServer.json()).resolves.toMatchObject({
      issuer: `${origin}/api/auth`,
      authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
      registration_endpoint: `${origin}/api/auth/oauth2/register`,
      scopes_supported: ["mail:read", "mail:write", "mail:send", "offline_access"]
    });
  });

  it("dynamically registers a public MCP client with bounded scopes", async () => {
    const response = await SELF.fetch(`${origin}/api/auth/oauth2/register`, {
      body: JSON.stringify({
        client_name: "HQBase integration test",
        redirect_uris: ["https://client.example/callback"],
        scope: "mail:read mail:write",
        token_endpoint_auth_method: "none"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      client_name: "HQBase integration test",
      redirect_uris: ["https://client.example/callback"],
      scope: "mail:read mail:write",
      token_endpoint_auth_method: "none"
    });
  });

  it("challenges unauthenticated clients with protected-resource discovery", async () => {
    const response = await mcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "HQBase test", version: "1.0.0" }
      }
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `${origin}/.well-known/oauth-protected-resource/mcp`
    );
  });

  it("initializes with a session-bound OAuth token", async () => {
    const response = await mcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "HQBase test", version: "1.0.0" }
        }
      },
      accessToken
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "HQBase Community", version: "1.0.0" },
        capabilities: { tools: {} }
      }
    });

    const tools = await mcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      accessToken
    );
    expect(tools.status).toBe(200);
    const toolsPayload = (await tools.json()) as { result?: { tools?: Array<{ name: string }> } };
    expect(toolsPayload.result?.tools?.map((tool) => tool.name)).toEqual([
      "list_mailboxes",
      "search_messages",
      "get_message",
      "update_message",
      "send_email",
      "reply_to_message"
    ]);
  });

  it("rejects revoked access tokens immediately", async () => {
    await env.DB.prepare("DELETE FROM oauthAccessToken WHERE id = 'access_mcp'").run();
    const response = await mcpRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
      accessToken
    );
    expect(response.status).toBe(401);
  });

  it("applies the MCP OAuth schema migration", async () => {
    const result = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN
       ('oauthClient', 'oauthRefreshToken', 'oauthAccessToken', 'oauthConsent')`
    ).all<{ name: string }>();
    expect(result.results.map((row) => row.name).sort()).toEqual([
      "oauthAccessToken",
      "oauthClient",
      "oauthConsent",
      "oauthRefreshToken"
    ]);
  });
});

function mcpRequest(body: unknown, token?: string): Promise<Response> {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-11-25"
  });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return SELF.fetch(`${origin}/mcp`, {
    body: JSON.stringify(body),
    headers,
    method: "POST"
  });
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of source
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}
