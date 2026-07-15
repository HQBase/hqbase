import { Hono } from "hono";
import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { recordAudit } from "../audit/service";
import { verifyUpgradeCutoverWithGrant } from "./cutover";
import { getUpgradeLifecycle } from "./queries";

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
  const token = c.env.HQBASE_SETUP_OAUTH_ACCESS_TOKEN;
  if (!token)
    throw new Error(
      "The temporary installation grant expired. Restart Pro installation to authorize again."
    );
  const { domainCount, lifecycle: verified } = await verifyUpgradeCutoverWithGrant(c.env, token);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "upgrade.cutover_verified",
    resourceType: "workspace",
    resourceId: verified.targetWorkerName,
    outcome: "success",
    metadata: { domainCount }
  });
  return c.json(verified);
});
