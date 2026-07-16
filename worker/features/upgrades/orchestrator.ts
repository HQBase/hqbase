import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { advanceWorkspaceBackup } from "./backup";
import { discoverCommunityInstallation } from "./cloudflare";
import { resolveUpgradeDraft } from "./continuation";
import { promoteCandidate, stageCandidateForValidation, uploadProCandidate } from "./deployment";
import { migrateToPro, verifyProCandidate } from "./migration";
import { revokeUpgradeGrant } from "./oauth";
import { auditTransition, getUpgrade, recordUpgradeError, transitionUpgrade } from "./queries";
import { downloadVerifiedProBundle } from "./release";
import { prepareProResources } from "./resources";
import type { UpgradeRecord } from "./types";
import { deleteCandidateValidators } from "./validator";

export async function getUpgradeStatus(request: Request, env: WorkerEnv): Promise<Response> {
  const { upgrade, draft } = await requireOwnedUpgrade(request, env, false);
  if (
    new Date(upgrade.expiresAt) <= new Date() &&
    !["complete", "failed", "recovery_required"].includes(upgrade.state)
  ) {
    const cleaned = await cleanExpiredGrant(env, upgrade, draft.cloudflareAccessToken);
    await env.DB.prepare(
      `UPDATE community_pro_upgrades
       SET state = ?, error_code = 'UPGRADE_SESSION_EXPIRED',
           recovery_action = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        cleaned ? "failed" : "recovery_required",
        cleaned
          ? "Start a new purchase recovery session."
          : "Temporary Cloudflare access cleanup requires operator verification before retrying.",
        upgrade.id
      )
      .run();
    const expired = await getUpgrade(env.DB, upgrade.id);
    if (!expired) throw new Error("Upgrade record disappeared.");
    return Response.json(publicStatus(expired), { headers: { "cache-control": "no-store" } });
  }
  return Response.json(publicStatus(upgrade), { headers: { "cache-control": "no-store" } });
}

export async function advanceUpgrade(request: Request, env: WorkerEnv): Promise<Response> {
  const { upgrade, draft } = await requireOwnedUpgrade(request, env, true);
  const token = draft.cloudflareAccessToken;
  if (!token) {
    throw new AppError(
      "UPGRADE_CLOUDFLARE_REAUTH_REQUIRED",
      "Authorize Cloudflare again to resume this upgrade.",
      401
    );
  }
  if (new Date(upgrade.expiresAt) <= new Date()) {
    throw new AppError(
      "UPGRADE_SESSION_EXPIRED",
      "This upgrade session expired. Start a new purchase recovery session.",
      410
    );
  }
  try {
    const current = await advanceOneState(env, upgrade, draft, token);
    return Response.json(publicStatus(current), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof AppError ? error.code : "UPGRADE_STEP_FAILED";
    const action = recoveryAction(code);
    await recordUpgradeError(env.DB, upgrade.id, code, action);
    throw error;
  }
}

async function advanceOneState(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  draft: {
    licenseKey?: string;
    orchestrationSecret?: string;
  },
  token: string
): Promise<UpgradeRecord> {
  if (upgrade.state === "cloudflare_authorized") {
    const inventory = await discoverCommunityInstallation(env, token, {
      installationId: upgrade.installationId,
      workerName: upgrade.workerName,
      workspaceOrigin: upgrade.workspaceOrigin
    });
    const counts = await preflightCounts(env.DB);
    return transitionUpgrade(env.DB, upgrade.id, "cloudflare_authorized", "target_verified", {
      account_id: inventory.accountId,
      active_version_id: inventory.activeVersionId,
      d1_database_id: inventory.d1DatabaseId,
      r2_bucket_name: inventory.r2BucketName,
      inventory_json: JSON.stringify(inventory),
      preflight_counts_json: JSON.stringify(counts),
      error_code: null,
      recovery_action: null
    });
  }
  if (upgrade.state === "target_verified") {
    if (!draft.licenseKey) {
      throw new AppError(
        "UPGRADE_SESSION_MISSING",
        "Resume the purchase-bound upgrade session.",
        409
      );
    }
    await downloadVerifiedProBundle(env, upgrade, draft.licenseKey);
    return advanceWorkspaceBackup(env, upgrade, token);
  }
  if (upgrade.state === "backup_complete") {
    return (await prepareProResources(env, upgrade, token)).upgrade;
  }
  if (upgrade.state === "resources_prepared") {
    if (!draft.licenseKey || !draft.orchestrationSecret) {
      throw new AppError(
        "UPGRADE_SESSION_MISSING",
        "Resume the purchase-bound upgrade session.",
        409
      );
    }
    const bundle = await downloadVerifiedProBundle(env, upgrade, draft.licenseKey);
    return uploadProCandidate(
      env,
      upgrade,
      token,
      draft.licenseKey,
      draft.orchestrationSecret,
      bundle
    );
  }
  if (upgrade.state === "candidate_uploaded") {
    await stageCandidateForValidation(upgrade, token);
    await auditTransition(env.DB, upgrade.id, "candidate_staged_at_zero_percent", "success");
    return transitionUpgrade(env.DB, upgrade.id, "candidate_uploaded", "migration_started");
  }
  if (upgrade.state === "migration_started") {
    if (!draft.licenseKey) {
      throw new AppError(
        "UPGRADE_SESSION_MISSING",
        "Resume the purchase-bound upgrade session.",
        409
      );
    }
    const bundle = await downloadVerifiedProBundle(env, upgrade, draft.licenseKey);
    return migrateToPro(env, upgrade, token, bundle);
  }
  if (upgrade.state === "migration_complete") {
    if (!draft.orchestrationSecret) {
      throw new AppError(
        "UPGRADE_SESSION_MISSING",
        "Resume the purchase-bound upgrade session.",
        409
      );
    }
    return verifyProCandidate(env, upgrade, token, draft.orchestrationSecret);
  }
  if (upgrade.state === "candidate_verified") {
    return promoteCandidate(env, upgrade, token);
  }
  if (["created", "purchase_verified"].includes(upgrade.state)) {
    throw new AppError(
      "UPGRADE_AUTHORIZATION_REQUIRED",
      "Complete purchase verification and Cloudflare authorization first.",
      409
    );
  }
  return upgrade;
}

async function requireOwnedUpgrade(request: Request, env: WorkerEnv, recent: boolean) {
  const auth = await requireAuthContext(env, request);
  requireRole(auth, ["owner"], "Only the workspace owner can manage this upgrade.");
  if (recent) requireRecentSession(auth);
  const draft = await resolveUpgradeDraft(request, env);
  if (!draft)
    throw new AppError("UPGRADE_SESSION_MISSING", "Resume the upgrade from Settings.", 404);
  const upgrade = await getUpgrade(env.DB, draft.upgradeId);
  if (!upgrade) throw new AppError("UPGRADE_NOT_FOUND", "The upgrade session was not found.", 404);
  if (upgrade.workspaceOrigin !== new URL(request.url).origin) {
    throw new AppError(
      "UPGRADE_ORIGIN_MISMATCH",
      "The upgrade belongs to another workspace origin.",
      403
    );
  }
  return { draft, upgrade };
}

async function preflightCounts(db: D1Database): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [
    "user",
    "session",
    "mailboxes",
    "messages",
    "message_attachments"
  ] as const) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
      .first<{ count: number }>();
    counts[table] = row?.count ?? 0;
  }
  return counts;
}

function publicStatus(upgrade: UpgradeRecord) {
  return {
    id: upgrade.id,
    state: upgrade.state,
    errorCode: upgrade.errorCode,
    recoveryAction: upgrade.recoveryAction,
    updatedAt: upgrade.updatedAt,
    completedAt: upgrade.completedAt
  };
}

function recoveryAction(code: string): string {
  if (code === "UPGRADE_RELEASE_UNSUPPORTED") {
    return "Return to Settings, apply the current signed Community update, then retry the Pro upgrade.";
  }
  if (code.includes("REAUTH") || code.includes("CLOUDFLARE")) {
    return "Authorize Cloudflare again, then resume the upgrade.";
  }
  return "Retry this step. If it fails again, keep Community online and contact HQBase support.";
}

async function cleanExpiredGrant(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string | undefined
): Promise<boolean> {
  if (!token) return true;
  let cleaned = true;
  if (upgrade.accountId) {
    await deleteCandidateValidators(env, upgrade, token).catch(() => {
      cleaned = false;
    });
    for (const name of ["HQBASE_SETUP_OAUTH_ACCESS_TOKEN", "PRO_UPGRADE_ORCHESTRATION_SECRET"]) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${upgrade.accountId}/workers/scripts/${encodeURIComponent(upgrade.workerName)}/secrets/${name}`,
        { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
      ).catch(() => null);
      if (response && !response.ok && response.status !== 404) cleaned = false;
    }
  }
  await revokeUpgradeGrant(token, env).catch(() => {
    cleaned = false;
  });
  return cleaned;
}
