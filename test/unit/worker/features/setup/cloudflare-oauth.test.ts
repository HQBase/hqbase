import {
  finishCloudflareOAuth,
  getCloudflareOAuthStatus,
  resolveCloudflareAccess,
  revokeCloudflareGrant,
  startCloudflareOAuth
} from "@worker/features/setup/cloudflare-oauth";
import { describe, expect, it, vi } from "vitest";

const env = {
  BETTER_AUTH_SECRET: "test-better-auth-secret-with-enough-entropy",
  HQBASE_CLOUDFLARE_OAUTH_CLIENT_ID: "community-client",
  HQBASE_CLOUDFLARE_OAUTH_REDIRECT_URI: "https://auth.hqbase.io/community/oauth/callback",
  HQBASE_CLOUDFLARE_OAUTH_RELAY_URL: "https://auth.hqbase.io"
};

describe("Cloudflare setup OAuth", () => {
  it("starts PKCE without exposing the verifier and clears an older grant", async () => {
    const response = await startCloudflareOAuth(
      new Request("https://example.user.workers.dev/"),
      env
    );
    const target = new URL(response.headers.get("location") ?? "");
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(target.toString()).not.toContain("verifier");
    expect(target.pathname).toBe("/community/oauth/authorize");
    expect(target.searchParams.get("callback")).toBe(
      "https://example.user.workers.dev/api/setup/cloudflare/oauth/callback"
    );
    expect(target.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookies).toContain("hqb_cf_oauth_verifier=");
    expect(cookies).toContain("hqb_cf_oauth_state=");
    expect(cookies).toContain(
      "hqb_cf_oauth_grant=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );
  });

  it("exchanges the code, encrypts the grant cookie, and resolves it server-side", async () => {
    const started = await startCloudflareOAuth(
      new Request("https://example.user.workers.dev/"),
      env
    );
    const startCookies = started.headers.get("set-cookie") ?? "";
    const state = cookieValue(startCookies, "hqb_cf_oauth_state");
    const verifier = cookieValue(startCookies, "hqb_cf_oauth_verifier");
    const tokenFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ access_token: "oauth-access-secret" }))
    );
    const finished = await finishCloudflareOAuth(
      new Request(
        `https://example.user.workers.dev/api/setup/cloudflare/oauth/callback?code=code-1&state=${state}`,
        {
          headers: {
            cookie: cookieHeader({ hqb_cf_oauth_state: state, hqb_cf_oauth_verifier: verifier })
          }
        }
      ),
      env,
      tokenFetch
    );
    const grantCookie = finished.headers.get("set-cookie") ?? "";
    const encryptedGrant = cookieValue(grantCookie, "hqb_cf_oauth_grant");
    const grantRequest = new Request(
      "https://example.user.workers.dev/api/setup/cloudflare/zones",
      {
        headers: { cookie: cookieHeader({ hqb_cf_oauth_grant: encryptedGrant }) }
      }
    );

    expect(finished.status).toBe(303);
    expect(finished.headers.get("location")).toBe(
      "https://example.user.workers.dev/?cloudflare=connected"
    );
    expect(grantCookie).not.toContain("oauth-access-secret");
    await expect(getCloudflareOAuthStatus(grantRequest, env)).resolves.toEqual({ connected: true });
    await expect(resolveCloudflareAccess(grantRequest, env)).resolves.toEqual({
      apiToken: "oauth-access-secret",
      source: "oauth"
    });

    const tokenRequest = tokenFetch.mock.calls[0];
    expect(tokenRequest?.[0]).toBe("https://dash.cloudflare.com/oauth2/token");
    expect(String(tokenRequest?.[1]?.body)).toContain(`code_verifier=${verifier}`);
    expect(String(tokenRequest?.[1]?.body)).toContain("client_id=community-client");
  });

  it("rejects an invalid callback state before exchanging a code", async () => {
    const tokenFetch = vi.fn<typeof fetch>();
    const response = await finishCloudflareOAuth(
      new Request(
        "https://example.user.workers.dev/api/setup/cloudflare/oauth/callback?code=code-1&state=wrong",
        {
          headers: {
            cookie: cookieHeader({
              hqb_cf_oauth_state: "expected",
              hqb_cf_oauth_verifier: "v".repeat(64)
            })
          }
        }
      ),
      env,
      tokenFetch
    );

    expect(response.headers.get("location")).toBe(
      "https://example.user.workers.dev/?cloudflare=invalid"
    );
    expect(tokenFetch).not.toHaveBeenCalled();
  });

  it("keeps a valid manual token as the explicit fallback", async () => {
    await expect(
      resolveCloudflareAccess(
        new Request("https://example.user.workers.dev/api/setup/cloudflare/zones"),
        env,
        "  manual-token  "
      )
    ).resolves.toEqual({ apiToken: "manual-token", source: "manual" });
  });

  it("revokes the temporary OAuth grant for the Community client", async () => {
    const revokeFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null)));
    await revokeCloudflareGrant("oauth-access-secret", env, revokeFetch);

    const request = revokeFetch.mock.calls[0];
    expect(request?.[0]).toBe("https://dash.cloudflare.com/oauth2/revoke");
    expect(String(request?.[1]?.body)).toBe("client_id=community-client&token=oauth-access-secret");
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
