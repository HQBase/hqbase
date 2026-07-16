import type { UpgradeRecord, UpgradeState } from "./types";

type UpgradeRow = {
  id: string;
  installation_id: string;
  worker_name: string;
  workspace_origin: string;
  state: UpgradeState;
  legacy_recovery: number;
  legacy_confirmed_at: string | null;
  account_id: string | null;
  active_version_id: string | null;
  candidate_version_id: string | null;
  preview_alias: string | null;
  d1_database_id: string | null;
  r2_bucket_name: string | null;
  checkpoint_bookmark: string | null;
  backup_r2_key: string | null;
  error_code: string | null;
  recovery_action: string | null;
  created_at: string;
  expires_at: string;
  updated_at: string;
  completed_at: string | null;
};

const transitionFields = new Set([
  "account_id",
  "active_version_id",
  "backup_r2_key",
  "candidate_version_id",
  "checkpoint_bookmark",
  "created_resources_json",
  "d1_database_id",
  "error_code",
  "inventory_json",
  "legacy_recovery",
  "preflight_counts_json",
  "preview_alias",
  "r2_bucket_name",
  "recovery_action"
]);

export async function ensureInstallationIdentity(
  db: D1Database,
  workerName: string,
  configuredInstallationId?: string
): Promise<{ installationId: string; workerName: string }> {
  const current = await db
    .prepare("SELECT installation_id, worker_name FROM installation_identity WHERE singleton = 1")
    .first<{ installation_id: string; worker_name: string }>();
  if (current) {
    if (configuredInstallationId && current.installation_id !== configuredInstallationId) {
      throw new Error("Installation identity does not match the Worker variable.");
    }
    if (current.worker_name !== workerName) {
      throw new Error("Installation identity does not match the Worker name.");
    }
    return { installationId: current.installation_id, workerName: current.worker_name };
  }
  const installationId = configuredInstallationId || crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO installation_identity
       (singleton, installation_id, worker_name, created_at, updated_at)
       VALUES (1, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(installationId, workerName)
    .run();
  return { installationId, workerName };
}

export async function getActiveUpgrade(db: D1Database): Promise<UpgradeRecord | null> {
  const row = await db
    .prepare(
      `SELECT * FROM community_pro_upgrades
       ORDER BY CASE WHEN state NOT IN ('complete', 'failed', 'recovery_required') THEN 0 ELSE 1 END,
                created_at DESC
       LIMIT 1`
    )
    .first<UpgradeRow>();
  return row ? mapUpgrade(row) : null;
}

export async function getUpgrade(db: D1Database, id: string): Promise<UpgradeRecord | null> {
  const row = await db
    .prepare("SELECT * FROM community_pro_upgrades WHERE id = ?")
    .bind(id)
    .first<UpgradeRow>();
  return row ? mapUpgrade(row) : null;
}

export async function transitionUpgrade(
  db: D1Database,
  id: string,
  from: UpgradeState | readonly UpgradeState[],
  to: UpgradeState,
  fields: Record<string, string | number | null> = {}
): Promise<UpgradeRecord> {
  const allowed = Array.isArray(from) ? from : [from];
  const assignments = ["state = ?", "updated_at = datetime('now')"];
  const values: unknown[] = [to];
  for (const [name, value] of Object.entries(fields)) {
    if (!transitionFields.has(name)) throw new Error("Unsafe upgrade field.");
    assignments.push(`${name} = ?`);
    values.push(value);
  }
  if (to === "complete") assignments.push("completed_at = datetime('now')");
  const placeholders = allowed.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `UPDATE community_pro_upgrades SET ${assignments.join(", ")}
       WHERE id = ? AND state IN (${placeholders})`
    )
    .bind(...values, id, ...allowed)
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("Upgrade state changed concurrently.");
  await auditTransition(db, id, `${allowed.join("|")}->${to}`, "success");
  const updated = await getUpgrade(db, id);
  if (!updated) throw new Error("Upgrade record disappeared.");
  return updated;
}

export async function markUpgradeFailure(
  db: D1Database,
  id: string,
  state: "failed" | "recovery_required",
  errorCode: string,
  recoveryAction: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE community_pro_upgrades
       SET state = ?, error_code = ?, recovery_action = ?, updated_at = datetime('now')
       WHERE id = ? AND state <> 'complete'`
    )
    .bind(state, errorCode.slice(0, 64), recoveryAction.slice(0, 240), id)
    .run();
  await auditTransition(db, id, state, "failure", { errorCode: errorCode.slice(0, 64) });
}

export async function recordUpgradeError(
  db: D1Database,
  id: string,
  errorCode: string,
  recoveryAction: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE community_pro_upgrades
       SET error_code = ?, recovery_action = ?, updated_at = datetime('now')
       WHERE id = ? AND state NOT IN ('complete', 'failed')`
    )
    .bind(errorCode.slice(0, 64), recoveryAction.slice(0, 240), id)
    .run();
  await auditTransition(db, id, "step_error", "failure", { errorCode: errorCode.slice(0, 64) });
}

export async function auditTransition(
  db: D1Database,
  upgradeId: string,
  transition: string,
  outcome: "success" | "failure" | "denied",
  metadata: Record<string, string | number | boolean | null> = {}
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO community_pro_upgrade_audit
       (id, upgrade_id, transition, outcome, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      crypto.randomUUID(),
      upgradeId,
      transition.slice(0, 96),
      outcome,
      JSON.stringify(metadata)
    )
    .run();
}

function mapUpgrade(row: UpgradeRow): UpgradeRecord {
  return {
    id: row.id,
    installationId: row.installation_id,
    workerName: row.worker_name,
    workspaceOrigin: row.workspace_origin,
    state: row.state,
    legacyRecovery: row.legacy_recovery === 1,
    legacyConfirmedAt: row.legacy_confirmed_at,
    accountId: row.account_id,
    activeVersionId: row.active_version_id,
    candidateVersionId: row.candidate_version_id,
    previewAlias: row.preview_alias,
    d1DatabaseId: row.d1_database_id,
    r2BucketName: row.r2_bucket_name,
    checkpointBookmark: row.checkpoint_bookmark,
    backupR2Key: row.backup_r2_key,
    errorCode: row.error_code,
    recoveryAction: row.recovery_action,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}
