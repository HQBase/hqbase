import { Hono } from "hono";
import { z } from "zod";

import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { recordAudit } from "../audit/service";
import { insertAppPassword, listAppPasswords, revokeAppPassword } from "./queries";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(365).optional()
});

export const appPasswordRoutes = new Hono<HonoApp>();

appPasswordRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json(await listAppPasswords(c.env.DB, auth.user.id));
});

appPasswordRoutes.post("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  await enforceRateLimit(c.env.DB, c.env.PRO_SESSION_SECRET, {
    scope: "app-password.create",
    subject: auth.user.id,
    limit: 5,
    windowSeconds: 60 * 60
  });
  const input = parseWith(createSchema, await readJson(c.req.raw));
  const created = await insertAppPassword(
    c.env.DB,
    auth.user.id,
    input.name,
    c.env.PRO_APP_PASSWORD_PEPPER,
    input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null
  );
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "app_password.create",
    resourceType: "app_password",
    resourceId: created.appPassword.id,
    outcome: "success"
  });
  return c.json(created, 201);
});

appPasswordRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const revoked = await revokeAppPassword(c.env.DB, auth.user.id, c.req.param("id"));
  if (!revoked) throw new AppError("APP_PASSWORD_NOT_FOUND", "Active app password not found.", 404);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "app_password.revoke",
    resourceType: "app_password",
    resourceId: c.req.param("id"),
    outcome: "success"
  });
  return c.body(null, 204);
});
