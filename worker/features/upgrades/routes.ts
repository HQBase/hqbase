import { Hono } from "hono";
import type { HonoApp } from "../../lib/env";
import { finishUpgradeOAuth, startUpgradeOAuth } from "./oauth";
import { advanceUpgrade, confirmLegacyTarget, getUpgradeStatus } from "./orchestrator";
import { finishUpgradePurchase, startUpgradePurchase } from "./purchase";

export const proUpgradeRoutes = new Hono<HonoApp>();

proUpgradeRoutes.post("/purchase", (c) => startUpgradePurchase(c.req.raw, c.env));
proUpgradeRoutes.get("/purchase/callback", (c) => finishUpgradePurchase(c.req.raw, c.env));
proUpgradeRoutes.post("/oauth", (c) => startUpgradeOAuth(c.req.raw, c.env));
proUpgradeRoutes.get("/oauth/callback", (c) => finishUpgradeOAuth(c.req.raw, c.env));
proUpgradeRoutes.get("/status", (c) => getUpgradeStatus(c.req.raw, c.env));
proUpgradeRoutes.post("/confirm-legacy", (c) => confirmLegacyTarget(c.req.raw, c.env));
proUpgradeRoutes.post("/advance", (c) => advanceUpgrade(c.req.raw, c.env));
