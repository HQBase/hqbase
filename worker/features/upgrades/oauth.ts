import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { persistUpgradeContinuation, resolveUpgradeDraft } from "./continuation";
import { readUpgradeDraft, writeUpgradeDraft } from "./cookies";
import { auditTransition, getUpgrade, transitionUpgrade } from "./queries";

const tokenEndpoint = "https://dash.cloudflare.com/oauth2/token";
const revokeEndpoint = "https://dash.cloudflare.com/oauth2/revoke";
const oauthResumableStates = new Set([
  "purchase_verified",
  "cloudflare_authorized",
  "target_verified",
  "backup_complete",
  "resources_prepared",
  "candidate_uploaded",
  "migration_started",
  "migration_complete",
  "candidate_verified"
]);

export async function startUpgradeOAuth(request: Request, env: WorkerEnv): Promise<Response> {
  const auth = await requireAuthContext(env, request);
  requireRole(auth, ["owner"], "Only the workspace owner can authorize the upgrade.");
  requireRecentSession(auth);
  const draft = await resolveUpgradeDraft(request, env);
  if (!draft?.licenseKey)
    throw new AppError("UPGRADE_PURCHASE_REQUIRED", "Verify the purchase first.", 409);
  const upgrade = await getUpgrade(env.DB, draft.upgradeId);
  if (!upgrade || !oauthResumableStates.has(upgrade.state)) {
    throw new AppError(
      "UPGRADE_STATE_INVALID",
      "The upgrade is not ready for Cloudflare authorization.",
      409
    );
  }
  const verifier = randomToken(64);
  const state = randomToken(32);
  const relay = new URL("/upgrade/oauth/authorize", oauthConfig(env).relayUrl);
  relay.searchParams.set(
    "callback",
    `${new URL(request.url).origin}/api/upgrades/pro/oauth/callback`
  );
  relay.searchParams.set("state", state);
  relay.searchParams.set("code_challenge", await sha256Base64Url(verifier));
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append(
    "set-cookie",
    await writeUpgradeDraft(
      { ...draft, cloudflareVerifier: verifier, cloudflareState: state },
      env.BETTER_AUTH_SECRET
    )
  );
  return Response.json({ authorizeUrl: relay.toString() }, { headers });
}

export async function finishUpgradeOAuth(
  request: Request,
  env: WorkerEnv,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  const auth = await requireAuthContext(env, request);
  requireRole(auth, ["owner"], "Only the workspace owner can authorize the upgrade.");
  const url = new URL(request.url);
  const draft = await readUpgradeDraft(request, env.BETTER_AUTH_SECRET);
  const code = url.searchParams.get("code") ?? "";
  if (
    !draft?.licenseKey ||
    !draft.cloudflareVerifier ||
    !draft.cloudflareState ||
    url.searchParams.get("state") !== draft.cloudflareState ||
    !code ||
    url.searchParams.has("error")
  ) {
    return redirectResult(request, "oauth_error");
  }
  const upgrade = await getUpgrade(env.DB, draft.upgradeId);
  if (!upgrade || !oauthResumableStates.has(upgrade.state)) {
    return redirectResult(request, "oauth_expired");
  }
  const config = oauthConfig(env);
  const response = await fetcher(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: draft.cloudflareVerifier
    })
  });
  const token = (await safeJson(response)) as { access_token?: string };
  if (!response.ok || !token.access_token) return redirectResult(request, "oauth_error");
  if (upgrade.state === "purchase_verified") {
    await transitionUpgrade(env.DB, upgrade.id, "purchase_verified", "cloudflare_authorized");
  } else {
    await auditTransition(env.DB, upgrade.id, "cloudflare_reauthorized", "success", {
      resumedState: upgrade.state
    });
  }
  const orchestrationSecret = draft.orchestrationSecret ?? randomToken(32);
  await persistUpgradeContinuation(env, upgrade.id, {
    upgradeId: upgrade.id,
    licenseKey: draft.licenseKey,
    orchestrationSecret
  });
  const headers = new Headers({
    "cache-control": "no-store",
    location: `${url.origin}/?upgrade=progress`
  });
  headers.append(
    "set-cookie",
    await writeUpgradeDraft(
      {
        upgradeId: draft.upgradeId,
        ...(draft.nonce ? { nonce: draft.nonce } : {}),
        ...(draft.verifier ? { verifier: draft.verifier } : {}),
        licenseKey: draft.licenseKey,
        orchestrationSecret,
        cloudflareAccessToken: token.access_token
      },
      env.BETTER_AUTH_SECRET
    )
  );
  return new Response(null, { status: 303, headers });
}

export async function revokeUpgradeGrant(
  accessToken: string,
  env: WorkerEnv,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher(revokeEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauthConfig(env).clientId,
      token: accessToken
    })
  });
  if (!response.ok) throw new Error("Cloudflare grant revocation failed.");
}

function oauthConfig(env: WorkerEnv): { clientId: string; redirectUri: string; relayUrl: string } {
  const clientId = env.HQBASE_UPGRADE_CLOUDFLARE_OAUTH_CLIENT_ID?.trim();
  const redirectUri = env.HQBASE_UPGRADE_CLOUDFLARE_OAUTH_REDIRECT_URI?.trim();
  const relayUrl = env.HQBASE_CLOUDFLARE_OAUTH_RELAY_URL?.trim();
  if (!clientId || !redirectUri || !relayUrl) {
    throw new AppError(
      "UPGRADE_OAUTH_NOT_CONFIGURED",
      "Cloudflare authorization is not configured for this HQBase release.",
      503
    );
  }
  return { clientId, redirectUri, relayUrl };
}

function redirectResult(request: Request, result: string): Response {
  const target = new URL("/", request.url);
  target.searchParams.set("upgrade", result);
  return new Response(null, {
    status: 303,
    headers: { "cache-control": "no-store", location: target.toString() }
  });
}

function randomToken(size: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function base64Url(value: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
