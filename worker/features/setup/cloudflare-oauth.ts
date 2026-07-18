import { z } from "zod";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { hqbaseProductConfig } from "../../lib/product-config";

const VERIFIER_COOKIE = "hqb_cf_oauth_verifier";
const STATE_COOKIE = "hqb_cf_oauth_state";
const GRANT_COOKIE = "hqb_cf_oauth_grant";
const OAUTH_COOKIE_TTL_SECONDS = 10 * 60;
const GRANT_COOKIE_TTL_SECONDS = 15 * 60;
const TOKEN_ENDPOINT = "https://dash.cloudflare.com/oauth2/token";
const REVOKE_ENDPOINT = "https://dash.cloudflare.com/oauth2/revoke";

type OAuthConfigEnv = {
  HQBASE_CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  HQBASE_CLOUDFLARE_OAUTH_REDIRECT_URI?: string;
  HQBASE_CLOUDFLARE_OAUTH_RELAY_URL?: string;
};

type OAuthCookieEnv = Pick<WorkerEnv, "BETTER_AUTH_SECRET">;

export type CloudflareAccess = {
  apiToken: string;
  source: "manual" | "oauth";
};

const tokenResponseSchema = z.object({
  access_token: z.string().min(1)
});

export async function startCloudflareOAuth(
  request: Request,
  env: OAuthConfigEnv
): Promise<Response> {
  const config = oauthConfig(env);
  const verifier = randomBase64Url(64);
  const state = randomBase64Url(32);
  const relay = new URL("/community/oauth/authorize", config.relayUrl);
  relay.searchParams.set(
    "callback",
    `${new URL(request.url).origin}/api/setup/cloudflare/oauth/callback`
  );
  relay.searchParams.set("state", state);
  relay.searchParams.set("code_challenge", await sha256Base64Url(verifier));

  const headers = new Headers({
    "cache-control": "no-store",
    location: relay.toString()
  });
  headers.append("set-cookie", secureCookie(VERIFIER_COOKIE, verifier, OAUTH_COOKIE_TTL_SECONDS));
  headers.append("set-cookie", secureCookie(STATE_COOKIE, state, OAUTH_COOKIE_TTL_SECONDS));
  headers.append("set-cookie", clearCloudflareGrantCookie());
  return new Response(null, { headers, status: 303 });
}

export async function finishCloudflareOAuth(
  request: Request,
  env: OAuthConfigEnv & OAuthCookieEnv,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get("cookie"));
  const verifier = cookies.get(VERIFIER_COOKIE) ?? "";
  const expectedState = cookies.get(STATE_COOKIE) ?? "";
  const stateIsValid =
    verifier.length >= 43 &&
    expectedState.length > 0 &&
    url.searchParams.get("state") === expectedState;

  if (!stateIsValid) return oauthResultRedirect(request, "invalid");
  if (url.searchParams.get("error")) return oauthResultRedirect(request, "denied");

  const code = url.searchParams.get("code") ?? "";
  if (!code) return oauthResultRedirect(request, "invalid");
  const config = oauthConfig(env);
  const tokenResponse = await fetcher(TOKEN_ENDPOINT, {
    body: new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  let tokenBody: unknown = null;
  try {
    tokenBody = await tokenResponse.json();
  } catch {
    // Cloudflare errors occasionally arrive without a JSON body. The UI still gets a safe result.
  }
  const token = tokenResponseSchema.safeParse(tokenBody);
  if (!tokenResponse.ok || !token.success) return oauthResultRedirect(request, "error");

  const headers = oauthResultHeaders(request, "connected");
  headers.append(
    "set-cookie",
    secureCookie(
      GRANT_COOKIE,
      await encryptGrant(token.data.access_token, env.BETTER_AUTH_SECRET),
      GRANT_COOKIE_TTL_SECONDS
    )
  );
  return new Response(null, { headers, status: 303 });
}

export async function getCloudflareOAuthStatus(
  request: Request,
  env: OAuthCookieEnv
): Promise<{ connected: boolean }> {
  return { connected: Boolean(await readOAuthGrant(request, env)) };
}

export async function resolveCloudflareAccess(
  request: Request,
  env: OAuthCookieEnv,
  manualToken?: string
): Promise<CloudflareAccess> {
  const normalizedManualToken = manualToken?.trim();
  if (normalizedManualToken) return { apiToken: normalizedManualToken, source: "manual" };

  const grant = await readOAuthGrant(request, env);
  if (!grant) {
    throw new AppError(
      "CLOUDFLARE_ACCESS_REQUIRED",
      "Authorize Cloudflare again, or use the manual API-token fallback.",
      401
    );
  }
  return { apiToken: grant, source: "oauth" };
}

export async function revokeCloudflareGrant(
  accessToken: string,
  env: Pick<OAuthConfigEnv, "HQBASE_CLOUDFLARE_OAUTH_CLIENT_ID">,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const clientId =
    env.HQBASE_CLOUDFLARE_OAUTH_CLIENT_ID?.trim() || hqbaseProductConfig.communityOAuthClientId;
  const response = await fetcher(REVOKE_ENDPOINT, {
    body: new URLSearchParams({
      client_id: clientId,
      token: accessToken
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  if (!response.ok) {
    throw new AppError(
      "CLOUDFLARE_OAUTH_REVOKE_FAILED",
      "Cloudflare setup succeeded, but the temporary authorization could not be revoked. Retry to finish securely.",
      502
    );
  }
}

export function clearCloudflareGrantCookie(): string {
  return secureCookie(GRANT_COOKIE, "", 0);
}

async function readOAuthGrant(request: Request, env: OAuthCookieEnv): Promise<string | null> {
  const encrypted = parseCookies(request.headers.get("cookie")).get(GRANT_COOKIE);
  if (!encrypted) return null;
  try {
    return await decryptGrant(encrypted, env.BETTER_AUTH_SECRET);
  } catch {
    return null;
  }
}

function oauthConfig(env: OAuthConfigEnv): {
  clientId: string;
  redirectUri: string;
  relayUrl: string;
} {
  const clientId =
    env.HQBASE_CLOUDFLARE_OAUTH_CLIENT_ID?.trim() || hqbaseProductConfig.communityOAuthClientId;
  const redirectUri =
    env.HQBASE_CLOUDFLARE_OAUTH_REDIRECT_URI?.trim() ||
    hqbaseProductConfig.communityOAuthRedirectUri;
  const relayUrl =
    env.HQBASE_CLOUDFLARE_OAUTH_RELAY_URL?.trim() || hqbaseProductConfig.cloudflareOAuthRelayUrl;
  return { clientId, redirectUri, relayUrl };
}

function oauthResultRedirect(request: Request, result: string): Response {
  return new Response(null, {
    headers: oauthResultHeaders(request, result),
    status: 303
  });
}

function oauthResultHeaders(request: Request, result: string): Headers {
  const target = new URL("/", request.url);
  target.searchParams.set("cloudflare", result);
  const headers = new Headers({
    "cache-control": "no-store",
    location: target.toString()
  });
  headers.append("set-cookie", secureCookie(VERIFIER_COOKIE, "", 0));
  headers.append("set-cookie", secureCookie(STATE_COOKIE, "", 0));
  return headers;
}

async function encryptGrant(accessToken: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { iv, name: "AES-GCM" },
    await grantKey(secret, ["encrypt"]),
    new TextEncoder().encode(accessToken)
  );
  return `${base64Url(iv)}.${base64Url(encrypted)}`;
}

async function decryptGrant(value: string, secret: string): Promise<string> {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Invalid OAuth grant cookie.");
  const clear = await crypto.subtle.decrypt(
    { iv: fromBase64Url(iv).buffer as ArrayBuffer, name: "AES-GCM" },
    await grantKey(secret, ["decrypt"]),
    fromBase64Url(encrypted).buffer as ArrayBuffer
  );
  return new TextDecoder().decode(clear);
}

async function grantKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hqbase-community-cloudflare-oauth:${secret}`)
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, usages);
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function randomBase64Url(size: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function base64Url(value: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function parseCookies(value: string | null): Map<string, string> {
  return new Map(
    (value ?? "")
      .split(";")
      .map((part) => part.trim().split("=", 2))
      .filter((entry): entry is [string, string] => entry.length === 2)
      .map(([name, content]) => [name, decodeURIComponent(content)])
  );
}

function secureCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
