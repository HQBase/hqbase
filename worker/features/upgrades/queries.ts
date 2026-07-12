import type { UpgradeLifecycle } from "./types";

type UpgradeRow = {
  source_edition: "community";
  state: "migrated" | "deployed" | "cutover_verified";
  checkpoint_bookmark: string;
  backup_r2_key: string;
  source_worker_name: string | null;
  target_worker_name: string;
  started_at: string;
  migrated_at: string;
  deployed_at: string | null;
  cutover_verified_at: string | null;
  updated_at: string;
};

export async function getUpgradeLifecycle(db: D1Database): Promise<UpgradeLifecycle | null> {
  const row = await db
    .prepare(
      `SELECT source_edition, state, checkpoint_bookmark, backup_r2_key,
              source_worker_name, target_worker_name, started_at, migrated_at,
              deployed_at, cutover_verified_at, updated_at
       FROM pro_upgrade_lifecycle WHERE singleton = 1`
    )
    .first<UpgradeRow>();
  return row ? mapUpgrade(row) : null;
}

export async function markCutoverVerified(db: D1Database): Promise<UpgradeLifecycle> {
  await db
    .prepare(
      `UPDATE pro_upgrade_lifecycle
       SET state = 'cutover_verified', cutover_verified_at = datetime('now'),
           updated_at = datetime('now')
       WHERE singleton = 1 AND state IN ('deployed', 'cutover_verified')`
    )
    .run();
  const lifecycle = await getUpgradeLifecycle(db);
  if (!lifecycle) throw new Error("Community upgrade lifecycle was not found.");
  return lifecycle;
}

function mapUpgrade(row: UpgradeRow): UpgradeLifecycle {
  return {
    sourceEdition: row.source_edition,
    state: row.state,
    checkpointBookmark: row.checkpoint_bookmark,
    backupR2Key: row.backup_r2_key,
    sourceWorkerName: row.source_worker_name,
    targetWorkerName: row.target_worker_name,
    startedAt: row.started_at,
    migratedAt: row.migrated_at,
    deployedAt: row.deployed_at,
    cutoverVerifiedAt: row.cutover_verified_at,
    updatedAt: row.updated_at
  };
}
