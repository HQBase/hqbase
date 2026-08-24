import { type Context, Hono } from "hono";

import { mailApiBasePath, requireMailApiPrincipal } from "../../auth/mail-api";
import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";
import { ignoreMailEventFailure, publishMailboxMailEvent } from "../events/service";

import { restoreMailbox, softDeleteMailbox } from "./lifecycle-service";
import { listDeletedMailboxes, listMailboxesForUser } from "./queries";
import { createMailbox, updateExistingMailbox } from "./service";
import { createMailboxSchema, updateMailboxSchema } from "./validation";

export const mailboxRoutes = new Hono<HonoApp>();
export const mailboxReadRoutes = new Hono<HonoApp>();

const listForUser = async (c: Context<HonoApp>) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  const mailboxes = await listMailboxesForUser(c.env.DB, auth.principal.id, auth.principal.role);
  return c.json(mailApiBasePath(c.req.raw) === "/api/v1" ? mailboxes.map(toV1Mailbox) : mailboxes);
};

mailboxRoutes.get("/", listForUser);
mailboxReadRoutes.get("/", listForUser);

mailboxRoutes.get("/deleted", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await listDeletedMailboxes(c.env.DB));
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
  scheduleMailboxEvent(c, mailbox.id);
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
  scheduleMailboxEvent(c, c.req.param("id"));
  return c.json(updated);
});

mailboxRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const mailbox = await softDeleteMailbox(c.env.DB, c.req.param("id"), {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "mailbox.delete",
    resourceType: "mailbox",
    resourceId: c.req.param("id"),
    outcome: "success"
  });
  scheduleMailboxEvent(c, mailbox.id);
  return c.json(mailbox);
});

mailboxRoutes.post("/:id/restore", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const mailbox = await restoreMailbox(c.env.DB, c.req.param("id"), {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "mailbox.restore",
    resourceType: "mailbox",
    resourceId: c.req.param("id"),
    outcome: "success"
  });
  scheduleMailboxEvent(c, mailbox.id);
  return c.json(mailbox);
});

function scheduleMailboxEvent(c: Context<HonoApp>, mailboxId: string): void {
  c.executionCtx.waitUntil(ignoreMailEventFailure(publishMailboxMailEvent(c.env, mailboxId)));
}

type MailboxWithAccess = Awaited<ReturnType<typeof listMailboxesForUser>>[number];

function toV1Mailbox(mailbox: MailboxWithAccess) {
  return {
    id: mailbox.id,
    address: mailbox.address,
    addresses: [
      {
        id: mailbox.id,
        mailboxId: mailbox.id,
        mailDomainId: mailbox.mailDomainId,
        address: mailbox.address,
        displayName: mailbox.displayName,
        receiveEnabled: mailbox.isActive,
        sendEnabled: mailbox.isActive,
        isPrimary: true
      }
    ],
    displayName: mailbox.displayName,
    isActive: mailbox.isActive,
    accessLevel: mailbox.accessLevel,
    createdAt: mailbox.createdAt,
    updatedAt: mailbox.updatedAt
  };
}
