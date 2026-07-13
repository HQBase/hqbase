import { Hono } from "hono";

import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";

import { listMailboxes } from "./queries";
import { createMailbox, updateExistingMailbox } from "./service";
import { createMailboxSchema, updateMailboxSchema } from "./validation";

export const mailboxRoutes = new Hono<HonoApp>();

mailboxRoutes.get("/", async (c) => {
  await requireAuthContext(c.env, c.req.raw);
  return c.json(await listMailboxes(c.env.DB));
});

mailboxRoutes.post("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(createMailboxSchema, await readJson(c.req.raw));
  return c.json(await createMailbox(c.env.DB, input), 201);
});

mailboxRoutes.patch("/:id", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(updateMailboxSchema, await readJson(c.req.raw));
  const updated = await updateExistingMailbox(c.env.DB, c.req.param("id"), input);
  return c.json(updated);
});
