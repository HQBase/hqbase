import { Hono } from "hono";
import { z } from "zod";
import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { getEntitlementStatus } from "./queries";
import { activateWorkspace, refreshWorkspaceEntitlement } from "./service";

const activationSchema = z.object({
  licenseKey: z.string().trim().min(12).max(200),
  hostname: z.string().trim().min(1).max(253)
});

export const billingRoutes = new Hono<HonoApp>();

billingRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await getEntitlementStatus(c.env.DB));
});

billingRoutes.post("/activate", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(
    await activateWorkspace(c.env, parseWith(activationSchema, await readJson(c.req.raw)))
  );
});

billingRoutes.post("/refresh", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await refreshWorkspaceEntitlement(c.env));
});
