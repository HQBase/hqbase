import { Hono } from "hono";
import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { completeInPlaceUpgrade, verifyInPlaceCandidate } from "./in-place";

export const inPlaceUpgradeRoutes = new Hono<HonoApp>();

inPlaceUpgradeRoutes.post("/candidate/verify", (c) => verifyInPlaceCandidate(c.req.raw, c.env));

inPlaceUpgradeRoutes.post("/complete", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner"], "Only the workspace owner can complete this upgrade.");
  requireRecentSession(auth);
  return completeInPlaceUpgrade(c.req.raw, c.env);
});
