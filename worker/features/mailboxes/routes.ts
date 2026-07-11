import { Hono } from "hono";

import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";

import { listMailboxesForUser } from "./queries";
import { createMailbox, updateExistingMailbox } from "./service";
import { createMailboxSchema, updateMailboxSchema } from "./validation";

export const mailboxRoutes = new Hono<HonoApp>();

mailboxRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json(await listMailboxesForUser(c.env.DB, auth.user.id, auth.user.role));
});

mailboxRoutes.post("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(createMailboxSchema, await readJson(c.req.raw));
  const mailbox = await createMailbox(c.env.DB, input);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "mailbox.create",
    resourceType: "mailbox",
    resourceId: mailbox.id,
    outcome: "success"
  });
  return c.json(mailbox, 201);
});

mailboxRoutes.patch("/:id", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(updateMailboxSchema, await readJson(c.req.raw));
  const updated = await updateExistingMailbox(c.env.DB, c.req.param("id"), input);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "mailbox.update",
    resourceType: "mailbox",
    resourceId: c.req.param("id"),
    outcome: "success"
  });
  return c.json(updated);
});
