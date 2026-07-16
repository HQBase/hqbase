import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import { auditTransition } from "./queries";
import type { UpgradeInventory, UpgradeRecord } from "./types";

export async function disableWorkerPreviewUrls(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  inventory: UpgradeInventory,
  token: string,
  fetcher: typeof fetch
): Promise<void> {
  if (!inventory.subdomain.previews_enabled) return;
  const settings = await cloudflare<{ enabled?: boolean; previews_enabled?: boolean }>(
    token,
    `/accounts/${inventory.accountId}/workers/scripts/${inventory.workerName}/subdomain`,
    {
      method: "POST",
      body: JSON.stringify({
        enabled: inventory.subdomain.enabled,
        previews_enabled: false
      })
    },
    fetcher
  );
  if (settings.enabled !== inventory.subdomain.enabled || settings.previews_enabled !== false) {
    throw new AppError(
      "UPGRADE_PREVIEW_URLS_DISABLE_FAILED",
      "Cloudflare Preview URLs could not be disabled before the Pro version upload.",
      502
    );
  }
  await auditTransition(env.DB, upgrade.id, "preview_urls_disabled", "success");
}
