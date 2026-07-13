import { Hono } from "hono";

import { requireAuthContext } from "../auth/session";
import type { HonoApp } from "../lib/env";

export const meRoutes = new Hono<HonoApp>();

meRoutes.get("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  return c.json(authContext.user);
});
