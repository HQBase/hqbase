import { Hono } from "hono";

import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";

import { searchWorkspace } from "./service";

export const searchRoutes = new Hono<HonoApp>();

searchRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const query = c.req.query("q")?.trim() ?? "";
  if (query.length < 1 || query.length > 200) {
    throw new AppError("SEARCH_INVALID", "Search must contain from 1 to 200 characters.", 400);
  }

  return c.json(
    await searchWorkspace(c.env, {
      limit: searchLimit(c.req.query("limit")),
      query,
      role: auth.user.role,
      userId: auth.user.id
    })
  );
});

function searchLimit(value: string | undefined): number {
  if (value === undefined) return 5;
  const limit = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new AppError("SEARCH_INVALID", "Search limit must be an integer from 1 to 10.", 400);
  }
  return limit;
}
