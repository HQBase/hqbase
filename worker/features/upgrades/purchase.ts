import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { hqbaseProductConfig } from "../../lib/product-config";
import { getSetupStatus } from "../setup/queries";
import { persistUpgradeContinuation } from "./continuation";
import { readUpgradeDraft, writeUpgradeDraft } from "./cookies";
import {
  auditTransition,
  ensureInstallationIdentity,
  getUpgrade,
  transitionUpgrade
} from "./queries";

const UPGRADE_TTL_MS = 24 * 60 * 60 * 1000;

export async function startUpgradePurchase(
  request: Request,
  env: WorkerEnv,
  placement = "settings"
): Promise<Response> {
  const auth = await requireAuthContext(env, request);
  requireRole(auth, ["owner"], "Only the workspace owner can upgrade to Pro.");
  requireRecentSession(auth);
  const url = new URL(request.url);
  const origin = url.origin;
  const workerName = env.HQBASE_WORKER_NAME?.trim() || "hqbase";
  const identity = await ensureInstallationIdentity(env.DB, workerName, env.HQBASE_INSTALLATION_ID);
  const verifier = randomToken(64);
  const nonce = randomToken(32);
  const challenge = await sha256Base64Url(verifier);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + UPGRADE_TTL_MS);
  await env.DB.prepare(
    `UPDATE community_pro_upgrades
     SET state = 'failed', error_code = 'UPGRADE_SESSION_EXPIRED',
         recovery_action = 'Start a new purchase recovery session.', updated_at = ?
     WHERE installation_id = ?
       AND state NOT IN ('complete', 'failed', 'recovery_required')
       AND expires_at <= ?`
  )
    .bind(now.toISOString(), identity.installationId, now.toISOString())
    .run();
  try {
    await env.DB.prepare(
      `INSERT INTO community_pro_upgrades
       (id, installation_id, worker_name, workspace_origin, install_mode,
        purchase_nonce_hash, code_challenge, state, created_at, expires_at, updated_at)
       VALUES (?, ?, ?, ?, 'community_upgrade', ?, ?, 'created', ?, ?, ?)`
    )
      .bind(
        id,
        identity.installationId,
        identity.workerName,
        origin,
        await sha256Hex(nonce),
        challenge,
        now.toISOString(),
        expiresAt.toISOString(),
        now.toISOString()
      )
      .run();
  } catch {
    throw new AppError(
      "UPGRADE_ALREADY_RUNNING",
      "An upgrade is already in progress. Resume it from Settings.",
      409
    );
  }
  await auditTransition(env.DB, id, "created", "success", { actorId: auth.user.id });

  const checkout = new URL(
    "/buy/pro",
    env.HQBASE_BILLING_URL?.trim() || hqbaseProductConfig.billingUrl
  );
  checkout.searchParams.set("mode", "community_upgrade");
  checkout.searchParams.set("source", "hqbase-community");
  checkout.searchParams.set("placement", boundedPlacement(placement));
  checkout.searchParams.set("installation_id", identity.installationId);
  checkout.searchParams.set("worker_name", identity.workerName);
  checkout.searchParams.set("workspace_origin", origin);
  checkout.searchParams.set("callback", `${origin}/api/upgrades/pro/purchase/callback`);
  checkout.searchParams.set("nonce", nonce);
  checkout.searchParams.set("code_challenge", challenge);

  return Response.json(
    { checkoutUrl: checkout.toString(), upgradeId: id },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": await writeUpgradeDraft(
          { upgradeId: id, nonce, verifier },
          env.BETTER_AUTH_SECRET
        )
      }
    }
  );
}

export async function requireCompletedCommunitySetup(db: D1Database): Promise<void> {
  const setup = await getSetupStatus(db);
  if (!setup.isComplete) {
    throw new AppError(
      "UPGRADE_SETUP_INCOMPLETE",
      "Complete Community setup before upgrading to Pro.",
      409
    );
  }
}

export async function finishUpgradePurchase(
  request: Request,
  env: WorkerEnv,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  const url = new URL(request.url);
  const draft = await readUpgradeDraft(request, env.BETTER_AUTH_SECRET);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!draft?.nonce || !draft.verifier || !code || !state || state !== draft.nonce) {
    return redirectUpgrade(request, "purchase_error");
  }
  const upgrade = await getUpgrade(env.DB, draft.upgradeId);
  if (
    upgrade?.state !== "created" ||
    upgrade.workspaceOrigin !== url.origin ||
    new Date(upgrade.expiresAt) <= new Date()
  ) {
    return redirectUpgrade(request, "purchase_expired");
  }
  const callback = `${url.origin}/api/upgrades/pro/purchase/callback`;
  const response = await fetcher(
    new URL("/v1/install/token", env.HQBASE_BILLING_URL?.trim() || hqbaseProductConfig.billingUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: draft.verifier, callback })
    }
  );
  const claim = (await safeJson(response)) as {
    licenseKey?: string;
    mode?: string;
    installationId?: string;
    workerName?: string;
    workspaceOrigin?: string;
  };
  if (
    !response.ok ||
    !claim.licenseKey ||
    claim.mode !== "community_upgrade" ||
    claim.installationId !== upgrade.installationId ||
    claim.workerName !== upgrade.workerName ||
    claim.workspaceOrigin !== upgrade.workspaceOrigin
  ) {
    await auditTransition(env.DB, upgrade.id, "purchase_claim", "denied");
    return redirectUpgrade(request, "purchase_error");
  }
  await transitionUpgrade(env.DB, upgrade.id, "created", "purchase_verified");
  await persistUpgradeContinuation(env, upgrade.id, {
    upgradeId: upgrade.id,
    licenseKey: claim.licenseKey
  });
  const headers = new Headers({
    "cache-control": "no-store",
    location: `${url.origin}/?upgrade=authorize`
  });
  headers.append(
    "set-cookie",
    await writeUpgradeDraft({ ...draft, licenseKey: claim.licenseKey }, env.BETTER_AUTH_SECRET)
  );
  return new Response(null, { status: 303, headers });
}

function redirectUpgrade(request: Request, result: string): Response {
  const target = new URL("/", request.url);
  target.searchParams.set("upgrade", result);
  return new Response(null, {
    status: 303,
    headers: { "cache-control": "no-store", location: target.toString() }
  });
}

function boundedPlacement(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64) || "settings";
}

function randomToken(size: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
