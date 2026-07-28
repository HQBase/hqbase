import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import { hashOAuthToken } from "../../../worker/auth/oauth-token";

const origin = "https://hqbase.test";
const userId = "usr_mcp_member";
const sessionId = "ses_mcp_member";
const token = "hqb_access_mcp-hqbase-access-token";

describe("HQBase MCP server", () => {
  beforeAll(async () => {
    for (const migration of [
      initialMigration,
      workspaceMigration,
      oauthResourcesMigration,
      conversationMigration
    ]) {
      await applyMigration(migration);
    }
    const now = new Date();
    const storedAccessToken = await hashOAuthToken("mcp-hqbase-access-token");
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
         VALUES (?, ?, ?, 1, ?, ?, 'member', 0)`
      ).bind(userId, "MCP Member", "mcp-member@example.com", now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO "session"
         (id, expiresAt, token, createdAt, updatedAt, userId)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        sessionId,
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        "session-token-mcp-hqbase",
        now.toISOString(),
        now.toISOString(),
        userId
      ),
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_allowed', 'allowed@example.com', 'Allowed', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_hidden', 'hidden@example.com', 'Hidden', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
         VALUES ('mbx_allowed', ?, 'read', ?, ?, ?)`
      ).bind(userId, userId, now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('oc_mcp_hqbase', 'client_mcp_hqbase', 0, ?, 1, 1, ?, ?)`
      ).bind(
        JSON.stringify(["https://client.example/callback"]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, createdAt, updatedAt)
         VALUES ('consent_mcp_hqbase', 'client_mcp_hqbase', ?, ?, ?, ?)`
      ).bind(userId, JSON.stringify(["mail:read"]), now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO oauthAccessToken
         (id, token, clientId, sessionId, userId, expiresAt, createdAt, scopes)
         VALUES ('access_mcp_hqbase', ?, 'client_mcp_hqbase', ?, ?, ?, ?, ?)`
      ).bind(
        storedAccessToken,
        sessionId,
        userId,
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        now.toISOString(),
        JSON.stringify(["mail:read"])
      )
    ]);
  });

  it("publishes OAuth discovery and challenges unauthenticated clients", async () => {
    const metadata = await SELF.fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      resource: `${origin}/mcp`,
      authorization_servers: [`${origin}/api/auth`]
    });

    const challenge = await mcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "HQBase test", version: "1.0.0" }
      }
    });
    expect(challenge.status).toBe(401);
    expect(challenge.headers.get("www-authenticate")).toContain("oauth-protected-resource/mcp");
  });

  it("registers only tools granted by OAuth scopes", async () => {
    const response = await mcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      token
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { result?: { tools?: Array<{ name: string }> } };
    expect(payload.result?.tools?.map((tool) => tool.name)).toEqual([
      "list_mailboxes",
      "search_messages",
      "get_message"
    ]);
  });

  it("filters mailbox results through live mailbox grants", async () => {
    const response = await mcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_mailboxes", arguments: {} }
      },
      token
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      result?: { content?: Array<{ text?: string }> };
    };
    const mailboxes = JSON.parse(payload.result?.content?.[0]?.text ?? "[]") as Array<{
      id: string;
    }>;
    expect(mailboxes.map((mailbox) => mailbox.id)).toEqual(["mbx_allowed"]);
  });
});

function mcpRequest(body: unknown, accessToken?: string): Promise<Response> {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-hqbasetocol-version": "2025-11-25"
  });
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
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
