import { Hono } from "hono";
import { z } from "zod";
import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { getUpdateStatus, triggerUpdate } from "./service";

const triggerSchema = z.object({ apiToken: z.string().trim().min(20).max(500) });
export const updateRoutes = new Hono<HonoApp>();

updateRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await getUpdateStatus(c.env));
});

updateRoutes.post("/apply", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  requireRecentSession(auth);
  const input = parseWith(triggerSchema, await readJson(c.req.raw));
  return c.json(await triggerUpdate(c.env, input.apiToken), 202);
});
