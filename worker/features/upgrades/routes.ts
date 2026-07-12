import { Hono } from "hono";
import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";
import { getEntitlementStatus } from "../billing/queries";
import { listMailDomains } from "../domains/queries";
import { inspectCloudflareDomain } from "../setup/cloudflare";
import { getSetupStatus } from "../setup/queries";
import { getUpgradeLifecycle, markCutoverVerified } from "./queries";
import { verifyUpgradeCutoverSchema } from "./validation";

export const upgradeRoutes = new Hono<HonoApp>();

upgradeRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await getUpgradeLifecycle(c.env.DB));
});

upgradeRoutes.post("/verify-cutover", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  requireRecentSession(auth);
  const lifecycle = await getUpgradeLifecycle(c.env.DB);
  if (!lifecycle) {
    throw new AppError("UPGRADE_NOT_FOUND", "This workspace was not upgraded from Community.", 404);
  }
  if (lifecycle.state === "migrated") {
    throw new AppError("UPGRADE_NOT_DEPLOYED", "Pro deployment has not completed yet.", 409);
  }
  const entitlement = await getEntitlementStatus(c.env.DB);
  if (entitlement.state === "unlicensed" || entitlement.state === "inactive") {
    throw new AppError(
      "UPGRADE_LICENSE_REQUIRED",
      "Activate the HQBase Pro license before verifying cutover.",
      402
    );
  }

  const input = parseWith(verifyUpgradeCutoverSchema, await readJson(c.req.raw));
  const [domains, setup] = await Promise.all([listMailDomains(c.env.DB), getSetupStatus(c.env.DB)]);
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
      apiToken: input.apiToken,
      workerName: c.env.HQBASE_WORKER_NAME,
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

  const verified = await markCutoverVerified(c.env.DB);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "upgrade.cutover_verified",
    resourceType: "workspace",
    resourceId: verified.targetWorkerName,
    outcome: "success",
    metadata: { domainCount: enabled.length }
  });
  return c.json(verified);
});
