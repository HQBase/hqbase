import {
  finishRuntimeCloudflareOAuth,
  recentAuthenticationRedirect,
  resolveRuntimeCloudflareGrant,
  revokeRuntimeCloudflareGrant,
  startRuntimeCloudflareOAuth
} from "@worker/features/cloudflare/oauth";
import { describe, expect, it, vi } from "vitest";

const env = {
  BETTER_AUTH_SECRET: "test-better-auth-secret-with-enough-entropy",
  CLOUDFLARE_OAUTH_CLIENT_ID: "hqbase-client",
  CLOUDFLARE_OAUTH_REDIRECT_URI: "https://auth.hqbase.io/oauth/callback",
  CLOUDFLARE_OAUTH_RELAY_URL: "https://auth.hqbase.io"
};

const updateFlow = {
  callbackPath: "/api/updates/cloudflare/oauth/callback",
  operation: "updates",
  settingsTab: "updates"
} as const;

const setupFlow = {
  callbackPath: "/api/setup/cloudflare/oauth/callback",
  operation: "setup",
  returnPath: "/setup"
} as const;

describe("HQBase runtime Cloudflare OAuth", () => {
  it("returns stale sessions to the originating settings modal", () => {
    const response = recentAuthenticationRedirect(
      new Request("https://mail.example.com/api/updates/cloudflare/oauth/start"),
      "updates"
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://mail.example.com/settings/updates?reauth=required"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toBeNull();
  });

  it("starts operation-scoped PKCE without exposing the verifier", async () => {
    const response = await startRuntimeCloudflareOAuth(
      new Request("https://mail.example.com/settings"),
      env,
      updateFlow
    );
    const target = new URL(response.headers.get("location") ?? "");
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(target.pathname).toBe("/oauth/authorize");
    expect(target.searchParams.get("operation")).toBe("updates");
    expect(target.searchParams.get("callback")).toBe(
      "https://mail.example.com/api/updates/cloudflare/oauth/callback"
    );
    expect(target.toString()).not.toContain("verifier");
    expect(cookies).toContain("hqb_cf_oauth_verifier=");
    expect(cookies).toContain("hqb_cf_oauth_grant=");
  });

  it("exchanges, encrypts, and resolves the grant only on the server", async () => {
    const started = await startRuntimeCloudflareOAuth(
      new Request("https://mail.example.com/"),
      env,
      updateFlow
    );
    const startCookies = started.headers.get("set-cookie") ?? "";
    const state = cookieValue(startCookies, "hqb_cf_oauth_state");
    const verifier = cookieValue(startCookies, "hqb_cf_oauth_verifier");
    const tokenFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ access_token: "runtime-oauth-secret" }))
    );
    const finished = await finishRuntimeCloudflareOAuth(
      new Request(
        `https://mail.example.com/api/updates/cloudflare/oauth/callback?code=code-1&state=${state}`,
        {
          headers: {
            cookie: cookieHeader({
              hqb_cf_oauth_state: state,
              hqb_cf_oauth_verifier: verifier
            })
          }
        }
      ),
      env,
      updateFlow,
      tokenFetch
    );
    const grantCookie = finished.headers.get("set-cookie") ?? "";
    const encryptedGrant = cookieValue(grantCookie, "hqb_cf_oauth_grant");
    const grantRequest = new Request("https://mail.example.com/api/updates/apply", {
      headers: { cookie: cookieHeader({ hqb_cf_oauth_grant: encryptedGrant }) }
    });

    expect(finished.headers.get("location")).toBe(
      "https://mail.example.com/settings/updates?cloudflare=connected&settings=updates"
    );
    expect(grantCookie).not.toContain("runtime-oauth-secret");
    await expect(resolveRuntimeCloudflareGrant(grantRequest, env)).resolves.toBe(
      "runtime-oauth-secret"
    );
  });

  it("supports first-run setup without a private installer token", async () => {
    const started = await startRuntimeCloudflareOAuth(
      new Request("https://mail.example.com/setup"),
      env,
      setupFlow
    );
    const target = new URL(started.headers.get("location") ?? "");
    const startCookies = started.headers.get("set-cookie") ?? "";
    const state = cookieValue(startCookies, "hqb_cf_oauth_state");
    const verifier = cookieValue(startCookies, "hqb_cf_oauth_verifier");
    const finished = await finishRuntimeCloudflareOAuth(
      new Request(
        `https://mail.example.com/api/setup/cloudflare/oauth/callback?code=code-1&state=${state}`,
        {
          headers: {
            cookie: cookieHeader({
              hqb_cf_oauth_state: state,
              hqb_cf_oauth_verifier: verifier
            })
          }
        }
      ),
      env,
      setupFlow,
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ access_token: "setup-oauth-secret" }))
      )
    );

    expect(target.searchParams.get("operation")).toBe("setup");
    expect(target.searchParams.get("callback")).toBe(
      "https://mail.example.com/api/setup/cloudflare/oauth/callback"
    );
    expect(finished.headers.get("location")).toBe(
      "https://mail.example.com/setup?cloudflare=connected"
    );
    expect(finished.headers.get("set-cookie")).not.toContain("setup-oauth-secret");
  });

  it("requires a runtime OAuth grant and revokes it with the HQBase client", async () => {
    await expect(
      resolveRuntimeCloudflareGrant(new Request("https://mail.example.com/api/updates/apply"), env)
    ).rejects.toThrow("Authorize Cloudflare again");

    const revokeFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null)));
    await revokeRuntimeCloudflareGrant("runtime-oauth-secret", env, revokeFetch);
    expect(String(revokeFetch.mock.calls[0]?.[1]?.body)).toBe(
      "client_id=hqbase-client&token=runtime-oauth-secret"
    );
  });
});

function cookieValue(serialized: string, name: string): string {
  const match = serialized.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  if (!match?.[1]) throw new Error(`Missing ${name} cookie.`);
  return decodeURIComponent(match[1]);
}

function cookieHeader(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
}
