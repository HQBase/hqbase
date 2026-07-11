import { Hono } from "hono";

import { requireAuthContext, requireRole } from "../../auth/session";
import { createManagedUser } from "../../auth/user-actions";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";

import { listUsers, setWorkspaceUserRole } from "./queries";
import { createUserSchema, updateUserSchema } from "./validation";

export const userRoutes = new Hono<HonoApp>();

userRoutes.get("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);
  return c.json(await listUsers(c.env.DB));
});

userRoutes.post("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(createUserSchema, await readJson(c.req.raw));
  if (input.role === "owner" && authContext.user.role !== "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can create another owner.", 403);
  }
  const user = await createManagedUser(c.env, c.req.raw, input);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.create",
    resourceType: "user",
    resourceId: user.id,
    outcome: "success",
    metadata: { role: input.role }
  });
  return c.json(user, 201);
});

userRoutes.patch("/:id", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(updateUserSchema, await readJson(c.req.raw));
  const target = await c.env.DB.prepare('SELECT role FROM "user" WHERE id = ?')
    .bind(c.req.param("id"))
    .first<{ role: string | null }>();
  if (!target) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if ((input.role === "owner" || target.role === "owner") && authContext.user.role !== "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can change owner membership.", 403);
  }
  if (target.role === "owner" && input.role !== "owner") {
    const owners = await c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM "user" WHERE role = 'owner' AND COALESCE(banned, 0) = 0`
    ).first<{ count: number }>();
    if ((owners?.count ?? 0) <= 1) {
      throw new AppError("LAST_OWNER", "The last active owner cannot be demoted.", 409);
    }
  }
  await setWorkspaceUserRole(c.env.DB, c.req.param("id"), input.role);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.role.update",
    resourceType: "user",
    resourceId: c.req.param("id"),
    outcome: "success",
    metadata: { role: input.role }
  });
  return c.json({ ok: true });
});
