import { Hono } from "hono";
import { z } from "zod";

import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { insertAppPassword, listAppPasswords, revokeAppPassword } from "./queries";

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const appPasswordRoutes = new Hono<HonoApp>();

appPasswordRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json(await listAppPasswords(c.env.DB, auth.user.id));
});

appPasswordRoutes.post("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const input = parseWith(createSchema, await readJson(c.req.raw));
  return c.json(
    await insertAppPassword(c.env.DB, auth.user.id, input.name, c.env.PRO_APP_PASSWORD_PEPPER),
    201
  );
});

appPasswordRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const revoked = await revokeAppPassword(c.env.DB, auth.user.id, c.req.param("id"));
  if (!revoked) throw new AppError("APP_PASSWORD_NOT_FOUND", "Active app password not found.", 404);
  return c.body(null, 204);
});
