import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createPersonalAccessToken } from "../../../worker/features/personal-access-tokens/service";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
let bearer = "";

describe("personal access token route boundary", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES ('usr_pat_boundary', 'PAT Boundary', 'pat-boundary@example.com', 1, ?, ?, 'owner', 0)`
    )
      .bind(timestamp, timestamp)
      .run();
    const created = await createPersonalAccessToken(env.DB, {
      userId: "usr_pat_boundary",
      correlationId: "request_pat_boundary",
      name: "Boundary probe",
      expiresAt: null
    });
    bearer = created.token;
  });

  it("authenticates the versioned Mail API", async () => {
    const response = await patFetch("/api/v1/mailboxes");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it.each([
    ["users", "/api/users"],
    ["PAT management", "/api/personal-access-tokens"]
  ])("does not authenticate private %s routes", async (_label, path) => {
    const response = await patFetch(path);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("does not authenticate the legacy mail alias", async () => {
    const response = await patFetch("/api/send", {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("does not become a Cloudflare setup grant", async () => {
    const response = await patFetch("/api/setup/cloudflare/zones", {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CLOUDFLARE_ACCESS_REQUIRED" }
    });
  });

  it("does not create a Better Auth session", async () => {
    const response = await patFetch("/api/auth/get-session");
    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown;
    const authenticated =
      typeof body === "object" &&
      body !== null &&
      (Object.hasOwn(body, "session") || Object.hasOwn(body, "user"));
    expect(authenticated).toBe(false);
  });

  it.each([
    ["read-only", "/mcp", "/.well-known/oauth-protected-resource/mcp", "mail:read"],
    [
      "full",
      "/mcp/full",
      "/.well-known/oauth-protected-resource/mcp/full",
      "mail:read mail:write mail:send"
    ]
  ])("does not authenticate the %s MCP profile", async (_label, path, metadataPath, scope) => {
    const response = await patFetch(path, {
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "HQBase PAT boundary", version: "1.0.0" }
        }
      }),
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
        origin
      },
      method: "POST"
    });
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain(`resource_metadata="${origin}${metadataPath}"`);
    expect(challenge).toContain(`scope="${scope}"`);
  });
});

function patFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${bearer}`);
  return SELF.fetch(`${origin}${path}`, { ...init, headers });
}
