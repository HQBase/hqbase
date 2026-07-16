import type { WorkerEnv } from "../../lib/env";
import {
  openUpgradeContinuation,
  readUpgradeDraft,
  sealUpgradeContinuation,
  type UpgradeContinuation,
  type UpgradeDraft
} from "./cookies";
import { ensureInstallationIdentity, getActiveUpgrade, getUpgrade } from "./queries";
import type { UpgradeRecord } from "./types";

const terminalStates = new Set(["complete", "failed", "recovery_required"]);

export async function resolveUpgradeDraft(
  request: Request,
  env: WorkerEnv
): Promise<UpgradeDraft | null> {
  const origin = new URL(request.url).origin;
  const cookieDraft = await readUpgradeDraft(request, env.BETTER_AUTH_SECRET);
  if (cookieDraft) {
    const cookieUpgrade = await getUpgrade(env.DB, cookieDraft.upgradeId);
    if (cookieUpgrade && matchesActiveUpgrade(cookieUpgrade, origin)) {
      if (cookieDraft.licenseKey) {
        const stored = await readCiphertext(env.DB, cookieUpgrade.id);
        if (!stored) {
          await persistUpgradeContinuation(env, cookieUpgrade.id, {
            upgradeId: cookieUpgrade.id,
            licenseKey: cookieDraft.licenseKey,
            ...(cookieDraft.orchestrationSecret
              ? { orchestrationSecret: cookieDraft.orchestrationSecret }
              : {})
          });
        }
      }
      return cookieDraft;
    }
  }

  const workerName = env.HQBASE_WORKER_NAME?.trim() || "hqbase";
  const identity = await ensureInstallationIdentity(env.DB, workerName, env.HQBASE_INSTALLATION_ID);
  const upgrade = await getActiveUpgrade(env.DB);
  if (
    !upgrade ||
    !isResumable(upgrade, origin) ||
    upgrade.installationId !== identity.installationId ||
    upgrade.workerName !== identity.workerName
  ) {
    return null;
  }
  const continuation = await readUpgradeContinuation(env, upgrade.id);
  if (!continuation || continuation.upgradeId !== upgrade.id) return null;
  return {
    upgradeId: upgrade.id,
    licenseKey: continuation.licenseKey,
    ...(continuation.orchestrationSecret
      ? { orchestrationSecret: continuation.orchestrationSecret }
      : {})
  };
}

export async function persistUpgradeContinuation(
  env: WorkerEnv,
  upgradeId: string,
  continuation: UpgradeContinuation
): Promise<void> {
  if (continuation.upgradeId !== upgradeId || !continuation.licenseKey) {
    throw new Error("Invalid upgrade continuation.");
  }
  const ciphertext = await sealUpgradeContinuation(continuation, env.BETTER_AUTH_SECRET);
  const result = await env.DB.prepare(
    `UPDATE community_pro_upgrades
     SET continuation_ciphertext = ?, updated_at = datetime('now')
     WHERE id = ? AND state NOT IN ('complete', 'failed', 'recovery_required')`
  )
    .bind(ciphertext, upgradeId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("Upgrade continuation is not resumable.");
}

export async function clearUpgradeContinuation(db: D1Database, upgradeId: string): Promise<void> {
  await db
    .prepare("UPDATE community_pro_upgrades SET continuation_ciphertext = NULL WHERE id = ?")
    .bind(upgradeId)
    .run();
}

async function readUpgradeContinuation(
  env: WorkerEnv,
  upgradeId: string
): Promise<UpgradeContinuation | null> {
  const ciphertext = await readCiphertext(env.DB, upgradeId);
  if (!ciphertext) return null;
  try {
    return await openUpgradeContinuation(ciphertext, env.BETTER_AUTH_SECRET);
  } catch {
    return null;
  }
}

async function readCiphertext(db: D1Database, upgradeId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT continuation_ciphertext FROM community_pro_upgrades WHERE id = ?")
    .bind(upgradeId)
    .first<{ continuation_ciphertext: string | null }>();
  return row?.continuation_ciphertext ?? null;
}

function isResumable(upgrade: UpgradeRecord, origin: string): boolean {
  return matchesActiveUpgrade(upgrade, origin) && new Date(upgrade.expiresAt) > new Date();
}

function matchesActiveUpgrade(upgrade: UpgradeRecord, origin: string): boolean {
  return !terminalStates.has(upgrade.state) && upgrade.workspaceOrigin === origin;
}
