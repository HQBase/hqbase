import { Hono } from "hono";

import { requireMailboxAccess } from "../../auth/mailbox-access";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { recordAudit } from "../audit/service";
import { findMailboxForSending } from "../mailboxes/queries";
import { getMessageMailboxId } from "../messages/queries";

import { replyToMessage, sendNewMessage } from "./service";
import { replyMessageSchema, sendMessageSchema } from "./validation";

export const sendRoutes = new Hono<HonoApp>();

sendRoutes.post("/send", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "mail.send",
    subject: authContext.user.id,
    limit: 60,
    windowSeconds: 60
  });
  const input = parseWith(sendMessageSchema, await readJson(c.req.raw));
  const mailbox = await findMailboxForSending(c.env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  await requireMailboxAccess(
    c.env.DB,
    authContext.user.id,
    authContext.user.role,
    mailbox.id,
    "agent"
  );
  const sent = await sendNewMessage(c.env, input, authContext.user.id);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "message.send",
    resourceType: "mailbox",
    resourceId: mailbox.id,
    outcome: "success"
  });
  return c.json(sent, 201);
});

sendRoutes.post("/reply", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "mail.reply",
    subject: authContext.user.id,
    limit: 60,
    windowSeconds: 60
  });
  const input = parseWith(replyMessageSchema, await readJson(c.req.raw));
  await requireMailboxAccess(
    c.env.DB,
    authContext.user.id,
    authContext.user.role,
    await getMessageMailboxId(c.env.DB, input.messageId),
    "agent"
  );
  const mailbox = await findMailboxForSending(c.env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  await requireMailboxAccess(
    c.env.DB,
    authContext.user.id,
    authContext.user.role,
    mailbox.id,
    "agent"
  );
  const sent = await replyToMessage(c.env, input, authContext.user.id);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "message.reply",
    resourceType: "mailbox",
    resourceId: mailbox.id,
    outcome: "success"
  });
  return c.json(sent, 201);
});
