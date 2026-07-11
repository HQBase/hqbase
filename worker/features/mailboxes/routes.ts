import { Hono } from "hono";

import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";

import { listMailboxesForUser } from "./queries";
import {
  createMailbox,
  createMailboxAddress,
  removeMailboxAddress,
  updateExistingMailbox
} from "./service";
import { createMailboxAddressSchema, createMailboxSchema, updateMailboxSchema } from "./validation";

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

mailboxRoutes.post("/:id/addresses", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const address = await createMailboxAddress(
    c.env.DB,
    c.req.param("id"),
    parseWith(createMailboxAddressSchema, await readJson(c.req.raw))
  );
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "mailbox_address.create",
    resourceType: "mailbox",
    resourceId: c.req.param("id"),
    outcome: "success"
  });
  return c.json(address, 201);
});

mailboxRoutes.delete("/:id/addresses/:addressId", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  await removeMailboxAddress(c.env.DB, c.req.param("id"), c.req.param("addressId"));
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "mailbox_address.delete",
    resourceType: "mailbox",
    resourceId: c.req.param("id"),
    outcome: "success"
  });
  return c.body(null, 204);
});
