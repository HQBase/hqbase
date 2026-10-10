import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { deviceCodeGrantType } from "../../../worker/auth/device-authorization";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
const redirectUri = "https://client.example/callback";
const fullScopes = "mail:read mail:write mail:send";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
};

describe("MCP offline access policy", () => {
  let cookie = "";
  let refreshClientId = "";
  let codeOnlyClientId = "";

  beforeAll(async () => {
    await applyCurrentMigrations();
    cookie = await signUp("mcp-offline@login.example");
    refreshClientId = await registerClient({
      client_name: "MCP refresh client",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none"
    });
    codeOnlyClientId = await registerClient({
      client_name: "MCP code-only client",
      grant_types: ["authorization_code"],
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none"
    });
  });

  it.each([
    ["/mcp", "mail:read"],
    ["/mcp/full", fullScopes]
  ])("issues a refresh token for %s when the client requests only the challenge scopes", async (path, challengeScopes) => {
    const resource = `${origin}${path}`;
    const challenge = await mcpRequest(path, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(challenge.status).toBe(401);
    expect(challenge.headers.get("www-authenticate")).toContain(`scope="${challengeScopes}"`);

    const grant = await authorize(refreshClientId, resource, challengeScopes);
    expect(grant.consentScopes).toEqual([...challengeScopes.split(" "), "offline_access"]);

    const token = await exchangeCode(refreshClientId, resource, grant);
    expect(token.refresh_token).toMatch(/^hqb_refresh_/);
    expect(token.scope?.split(" ")).toContain("offline_access");
    expect(await listTools(path, token.access_token)).toBe(200);

    const refreshed = await tokenRequest({
      client_id: refreshClientId,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token ?? "",
      resource
    });
    expect(refreshed.status, await refreshed.clone().text()).toBe(200);
    const renewed = (await refreshed.json()) as TokenResponse;
    expect(await listTools(path, renewed.access_token)).toBe(200);
  });

  it("issues a refresh token when an MCP request omits scope", async () => {
    // Better Auth then requests the client's registered scopes, which include offline_access.
    const resource = `${origin}/mcp/full`;
    const grant = await authorize(refreshClientId, resource);
    expect(grant.consentScopes).toContain("offline_access");

    const token = await exchangeCode(refreshClientId, resource, grant);
    expect(token.refresh_token).toMatch(/^hqb_refresh_/);
    expect(await listTools("/mcp/full", token.access_token)).toBe(200);
  });

  it("keeps requested scopes for clients without the refresh_token grant", async () => {
    const resource = `${origin}/mcp/full`;
    const grant = await authorize(codeOnlyClientId, resource, fullScopes);
    expect(grant.consentScopes).toEqual(fullScopes.split(" "));

    const token = await exchangeCode(codeOnlyClientId, resource, grant);
    expect(token.refresh_token).toBeUndefined();
    expect(await listTools("/mcp/full", token.access_token)).toBe(200);
  });

  it("keeps requested scopes for Mail API resources", async () => {
    const grant = await authorize(refreshClientId, `${origin}/api/v2`, "mail:read");
    expect(grant.consentScopes).toEqual(["mail:read"]);
  });

  it("adds offline access to MCP device authorization requests", async () => {
    const deviceClientId = await registerClient({
      application_type: "native",
      client_name: "MCP device client",
      grant_types: [deviceCodeGrantType, "refresh_token"],
      token_endpoint_auth_method: "none"
    });
    const response = await SELF.fetch(`${origin}/api/auth/device/code`, {
      body: new URLSearchParams({
        client_id: deviceClientId,
        resource: `${origin}/mcp/full`,
        scope: fullScopes
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const { device_code: deviceCode } = (await response.json()) as { device_code: string };
    const stored = await env.DB.prepare("SELECT scope FROM deviceCode WHERE deviceCode = ?")
      .bind(deviceCode)
      .first<{ scope: string }>();
    expect(stored?.scope.split(" ")).toEqual([...fullScopes.split(" "), "offline_access"]);
  });

  async function authorize(
    clientId: string,
    resource: string,
    scope?: string
  ): Promise<{ code: string; consentScopes: string[]; verifier: string }> {
    const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const query = new URLSearchParams({
      client_id: clientId,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      resource,
      response_type: "code",
      state: crypto.randomUUID()
    });
    if (scope) query.set("scope", scope);
    const authorization = await SELF.fetch(`${origin}/api/auth/oauth2/authorize?${query}`, {
      headers: { cookie },
      redirect: "manual"
    });
    const consentUrl = new URL(await redirectLocation(authorization), origin);
    expect(consentUrl.pathname).toBe("/oauth/consent");
    const consentScopes = consentUrl.searchParams.get("scope")?.split(" ") ?? [];

    const consent = await SELF.fetch(`${origin}/api/auth/oauth2/consent`, {
      body: JSON.stringify({ accept: true, oauth_query: consentUrl.search.slice(1) }),
      headers: { "content-type": "application/json", cookie, origin },
      method: "POST"
    });
    const callback = new URL(await redirectLocation(consent));
    const code = callback.searchParams.get("code");
    if (!code) throw new Error(`Authorization code was not issued: ${callback}`);
    return { code, consentScopes, verifier };
  }

  async function exchangeCode(
    clientId: string,
    resource: string,
    grant: { code: string; verifier: string }
  ): Promise<TokenResponse> {
    const response = await tokenRequest({
      client_id: clientId,
      code: grant.code,
      code_verifier: grant.verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      resource
    });
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json<TokenResponse>();
  }
});

async function signUp(email: string): Promise<string> {
  const response = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email, name: "MCP Offline", password: "mcp-offline-password" }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const match = (response.headers.get("set-cookie") ?? "").match(
    /(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/
  );
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}

async function registerClient(metadata: Record<string, unknown>): Promise<string> {
  const response = await SELF.fetch(`${origin}/api/auth/oauth2/register`, {
    body: JSON.stringify(metadata),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const registered = (await response.json()) as { client_id?: string };
  if (!registered.client_id) throw new Error("OAuth client was not registered.");
  return registered.client_id;
}

async function redirectLocation(response: Response): Promise<string> {
  if (response.status >= 300 && response.status < 400) {
    return response.headers.get("location") ?? "";
  }
  expect(response.status, await response.clone().text()).toBe(200);
  const payload = (await response.json()) as { url?: string };
  return payload.url ?? "";
}

function tokenRequest(fields: Record<string, string>): Promise<Response> {
  return SELF.fetch(`${origin}/api/auth/oauth2/token`, {
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
}

async function listTools(path: string, accessToken: string | undefined): Promise<number> {
  const response = await mcpRequest(
    path,
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    accessToken
  );
  return response.status;
}

function mcpRequest(path: string, body: unknown, accessToken?: string): Promise<Response> {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-11-25"
  });
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return SELF.fetch(`${origin}${path}`, { body: JSON.stringify(body), headers, method: "POST" });
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
