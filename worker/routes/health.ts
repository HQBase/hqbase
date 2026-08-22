import { Hono } from "hono";

import type { HonoApp } from "../lib/env";

export const healthRoutes = new Hono<HonoApp>();

healthRoutes.get("/", (c) => {
  return c.json({
    ok: true,
    service: "hqbase",
    version: c.env.HQBASE_APP_VERSION?.trim() || null,
    time: new Date().toISOString()
  });
});
