import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { getEntitlementStatus } from "../billing/queries";
import { listMailDomains } from "../domains/queries";
import { inspectCloudflareDomain } from "../setup/cloudflare";
import { getSetupStatus } from "../setup/queries";
import { getUpgradeLifecycle, markCutoverVerified } from "./queries";

export async function verifyUpgradeCutoverWithGrant(env: WorkerEnv, apiToken: string) {
  const lifecycle = await getUpgradeLifecycle(env.DB);
  if (!lifecycle) {
    throw new AppError("UPGRADE_NOT_FOUND", "This workspace was not upgraded from Community.", 404);
  }
  if (lifecycle.state === "migrated") {
    throw new AppError("UPGRADE_NOT_DEPLOYED", "Pro deployment has not completed yet.", 409);
  }
  const entitlement = await getEntitlementStatus(env.DB);
  if (entitlement.state === "unlicensed" || entitlement.state === "inactive") {
    throw new AppError(
      "UPGRADE_LICENSE_REQUIRED",
      "The purchase-bound Pro license must be active before cutover verification.",
      402
    );
  }

  const [domains, setup] = await Promise.all([listMailDomains(env.DB), getSetupStatus(env.DB)]);
  const enabled = domains.filter((domain) => domain.isEnabled);
  if (enabled.length === 0 || !setup.portalHostname) {
    throw new AppError(
      "UPGRADE_CUTOVER_INCOMPLETE",
      "Connect at least one email domain and the Pro portal before verification.",
      409
    );
  }
  for (const domain of enabled) {
    if (!domain.zoneId) {
      throw new AppError(
        "UPGRADE_DOMAIN_UNVERIFIED",
        `${domain.name} must be reconnected to its Cloudflare zone.`,
        409
      );
    }
    const status = await inspectCloudflareDomain({
      apiToken,
      workerName: env.HQBASE_WORKER_NAME,
      zoneId: domain.zoneId
    });
    if (!status.ready) {
      throw new AppError(
        "UPGRADE_DOMAIN_NOT_READY",
        `${domain.name} is not fully routed to ${status.workerName}.`,
        409
      );
    }
  }
  return { domainCount: enabled.length, lifecycle: await markCutoverVerified(env.DB) };
}
