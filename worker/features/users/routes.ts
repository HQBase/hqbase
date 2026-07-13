import { Hono } from "hono";

import { requireAuthContext, requireRole } from "../../auth/session";
import { createManagedUser } from "../../auth/user-actions";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";

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
  const user = await createManagedUser(c.env, c.req.raw, input);
  return c.json(user, 201);
});

userRoutes.patch("/:id", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(updateUserSchema, await readJson(c.req.raw));
  await setWorkspaceUserRole(c.env.DB, c.req.param("id"), input.role);
  return c.json({ ok: true });
});
