import { Hono } from "hono";
import type { HonoApp } from "../../lib/env";
import { finishUpgradeOAuth, startUpgradeOAuth } from "./oauth";
import { advanceUpgrade, getUpgradeStatus, pendingProRuntimeHandoff } from "./orchestrator";
import { finishUpgradePurchase, startUpgradePurchase } from "./purchase";

export const proUpgradeRoutes = new Hono<HonoApp>();

proUpgradeRoutes.post("/purchase", async (c) => {
  const body: { placement?: unknown } = await c.req.raw
    .clone()
    .json<{ placement?: unknown }>()
    .catch(() => ({}));
  const placement = typeof body.placement === "string" ? body.placement : "settings";
  return startUpgradePurchase(c.req.raw, c.env, placement);
});
proUpgradeRoutes.get("/purchase/callback", (c) => finishUpgradePurchase(c.req.raw, c.env));
proUpgradeRoutes.post("/oauth", (c) => startUpgradeOAuth(c.req.raw, c.env));
proUpgradeRoutes.get("/oauth/callback", (c) => finishUpgradeOAuth(c.req.raw, c.env));
proUpgradeRoutes.get("/status", (c) => getUpgradeStatus(c.req.raw, c.env));
proUpgradeRoutes.post("/advance", (c) => advanceUpgrade(c.req.raw, c.env));
proUpgradeRoutes.post("/complete", (c) => pendingProRuntimeHandoff(c.req.raw, c.env));
