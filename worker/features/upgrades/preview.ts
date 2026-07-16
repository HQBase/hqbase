import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import { readInventory } from "./deployment";
import { auditTransition } from "./queries";
import { readPreparedResources } from "./resources";
import type { UpgradeRecord } from "./types";

export async function enableCandidatePreview(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const inventory = await readInventory(env.DB, upgrade.id);
  const prepared = await readPreparedResources(env.DB, upgrade.id);
  if (inventory.subdomain?.previews_enabled || prepared.previewUrlsChanged) return;
  const result = await cloudflare<{ enabled?: boolean; previews_enabled?: boolean }>(
    token,
    `/accounts/${inventory.accountId}/workers/scripts/${inventory.workerName}/subdomain`,
    {
      method: "POST",
      body: JSON.stringify({
        enabled: inventory.subdomain?.enabled ?? false,
        previews_enabled: true
      })
    },
    fetcher
  );
  if (!result.previews_enabled) {
    throw new AppError(
      "UPGRADE_PREVIEW_ENABLE_FAILED",
      "Cloudflare Preview URLs could not be enabled for isolated candidate validation.",
      502
    );
  }
  await updatePreviewMutation(env.DB, upgrade, prepared, true);
  await auditTransition(env.DB, upgrade.id, "preview_urls_temporarily_enabled", "success");
}

export async function restoreCandidatePreview(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const inventory = await readInventory(env.DB, upgrade.id);
  const prepared = await readPreparedResources(env.DB, upgrade.id);
  if (!prepared.previewUrlsChanged) return;
  const original = {
    enabled: inventory.subdomain?.enabled ?? false,
    previews_enabled: inventory.subdomain?.previews_enabled ?? false
  };
  const result = await cloudflare<{ enabled?: boolean; previews_enabled?: boolean }>(
    token,
    `/accounts/${inventory.accountId}/workers/scripts/${inventory.workerName}/subdomain`,
    { method: "POST", body: JSON.stringify(original) },
    fetcher
  );
  if (
    result.enabled !== original.enabled ||
    result.previews_enabled !== original.previews_enabled
  ) {
    throw new AppError(
      "UPGRADE_PREVIEW_RESTORE_FAILED",
      "The original Cloudflare Preview URL setting could not be restored.",
      502
    );
  }
  await updatePreviewMutation(env.DB, upgrade, prepared, false);
  await auditTransition(env.DB, upgrade.id, "preview_urls_restored", "success");
}

async function updatePreviewMutation(
  db: D1Database,
  upgrade: UpgradeRecord,
  prepared: Awaited<ReturnType<typeof readPreparedResources>>,
  changed: boolean
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE community_pro_upgrades
       SET created_resources_json = ?, updated_at = datetime('now')
       WHERE id = ? AND state IN ('migration_complete', 'resources_prepared')`
    )
    .bind(JSON.stringify({ ...prepared, previewUrlsChanged: changed }), upgrade.id)
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("Upgrade state changed concurrently.");
}
