import { z } from "zod";

import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import {
  cloudflareAuthorizationUrl,
  isInvalidOAuthConfig,
  type OAuthConfigEnv,
  oauthClientId,
  resolveOAuthConfig
} from "./oauth-config";

const VERIFIER_COOKIE = "hqb_cf_oauth_verifier";
const STATE_COOKIE = "hqb_cf_oauth_state";
const GRANT_COOKIE = "hqb_cf_oauth_grant";
const OAUTH_COOKIE_TTL_SECONDS = 10 * 60;
const GRANT_COOKIE_TTL_SECONDS = 15 * 60;
const TOKEN_ENDPOINT = "https://dash.cloudflare.com/oauth2/token";
const REVOKE_ENDPOINT = "https://dash.cloudflare.com/oauth2/revoke";

type OAuthCookieEnv = Pick<WorkerEnv, "BETTER_AUTH_SECRET">;

export type RuntimeCloudflareOAuthFlow =
  | {
      callbackPath: string;
      operation: "domains" | "updates";
      settingsTab: "domains" | "updates";
    }
  | {
      callbackPath: string;
      operation: "setup";
      returnPath: "/setup";
    };

const tokenResponseSchema = z.object({ access_token: z.string().min(1) });

export async function startRuntimeCloudflareOAuth(
  request: Request,
  env: OAuthConfigEnv,
  flow: RuntimeCloudflareOAuthFlow
): Promise<Response> {
  let config: ReturnType<typeof resolveOAuthConfig>;
  try {
    config = resolveOAuthConfig(request, env, flow);
  } catch (error) {
    if (isInvalidOAuthConfig(error)) return oauthResultRedirect(request, "config", flow);
    throw error;
  }
  const verifier = randomBase64Url(64);
  const state = randomBase64Url(32);
  const codeChallenge = await sha256Base64Url(verifier);
  const target = cloudflareAuthorizationUrl(request, config, flow, state, codeChallenge);

  const headers = new Headers({ "cache-control": "no-store", location: target.toString() });
  headers.append("set-cookie", secureCookie(VERIFIER_COOKIE, verifier, OAUTH_COOKIE_TTL_SECONDS));
  headers.append("set-cookie", secureCookie(STATE_COOKIE, state, OAUTH_COOKIE_TTL_SECONDS));
  headers.append("set-cookie", clearRuntimeCloudflareGrantCookie());
  return new Response(null, { headers, status: 303 });
}

export async function finishRuntimeCloudflareOAuth(
  request: Request,
  env: OAuthConfigEnv & OAuthCookieEnv,
  flow: RuntimeCloudflareOAuthFlow,
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

  if (!stateIsValid) return oauthResultRedirect(request, "invalid", flow);
  if (url.searchParams.get("error")) return oauthResultRedirect(request, "denied", flow);

  const code = url.searchParams.get("code") ?? "";
  if (!code) return oauthResultRedirect(request, "invalid", flow);
  let config: ReturnType<typeof resolveOAuthConfig>;
  try {
    config = resolveOAuthConfig(request, env, flow);
  } catch (error) {
    if (isInvalidOAuthConfig(error)) return oauthResultRedirect(request, "config", flow);
    throw error;
  }
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
    // Cloudflare may return a non-JSON error. The browser still receives a bounded result state.
  }
  const token = tokenResponseSchema.safeParse(tokenBody);
  if (!tokenResponse.ok || !token.success) return oauthResultRedirect(request, "error", flow);

  const headers = oauthResultHeaders(request, "connected", flow);
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

export async function resolveRuntimeCloudflareGrant(
  request: Request,
  env: OAuthCookieEnv
): Promise<string> {
  const grant = await readGrant(request, env);
  if (!grant) {
    throw new AppError(
      "CLOUDFLARE_ACCESS_REQUIRED",
      "Authorize Cloudflare again. If your organization blocks the public HQBase OAuth application, configure customer-managed OAuth and retry.",
      401
    );
  }
  return grant;
}

export async function revokeRuntimeCloudflareGrant(
  accessToken: string,
  env: Pick<OAuthConfigEnv, "CLOUDFLARE_OAUTH_CLIENT_ID" | "CLOUDFLARE_OAUTH_MODE">,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const clientId = oauthClientId(env);
  const response = await fetcher(REVOKE_ENDPOINT, {
    body: new URLSearchParams({ client_id: clientId, token: accessToken }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  if (!response.ok) {
    throw new AppError(
      "CLOUDFLARE_OAUTH_REVOKE_FAILED",
      "The Cloudflare operation succeeded, but temporary authorization could not be revoked. Authorize again to retry secure cleanup.",
      502
    );
  }
}

export function clearRuntimeCloudflareGrantCookie(): string {
  return secureCookie(GRANT_COOKIE, "", 0);
}

export function recentAuthenticationRedirect(
  request: Request,
  settingsTab: "domains" | "updates"
): Response {
  const target = new URL(`/settings/${settingsTab}`, request.url);
  target.searchParams.set("reauth", "required");
  const headers = new Headers({ "cache-control": "no-store", location: target.toString() });
  return new Response(null, { headers, status: 303 });
}

async function readGrant(request: Request, env: OAuthCookieEnv): Promise<string | null> {
  const encrypted = parseCookies(request.headers.get("cookie")).get(GRANT_COOKIE);
  if (!encrypted) return null;
  try {
    return await decryptGrant(encrypted, env.BETTER_AUTH_SECRET);
  } catch {
    return null;
  }
}

function oauthResultRedirect(
  request: Request,
  result: string,
  flow: RuntimeCloudflareOAuthFlow
): Response {
  return new Response(null, { headers: oauthResultHeaders(request, result, flow), status: 303 });
}

function oauthResultHeaders(
  request: Request,
  result: string,
  flow: RuntimeCloudflareOAuthFlow
): Headers {
  const target = new URL(
    "returnPath" in flow ? flow.returnPath : `/settings/${flow.settingsTab}`,
    request.url
  );
  target.searchParams.set("cloudflare", result);
  if ("settingsTab" in flow) target.searchParams.set("settings", flow.settingsTab);
  const headers = new Headers({ "cache-control": "no-store", location: target.toString() });
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
    new TextEncoder().encode(`hqbase-runtime-cloudflare-oauth:${secret}`)
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
