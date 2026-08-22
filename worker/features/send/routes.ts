import { Hono } from "hono";
import { requireMailApiContext } from "../../auth/mail-api";
import { requireMailboxAccess } from "../../auth/mailbox-access";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { recordAudit } from "../audit/service";
import {
  getAccessibleDraft,
  requireDraftAttachmentIdsAccess,
  requireDraftIdAccess
} from "../drafts/access";
import { scheduleSentMailEvents } from "../events/service";
import { findMailboxForSending } from "../mailboxes/queries";
import { requireMessageAccess } from "../messages/access";

import { forwardMessage, sendForwardDraft } from "./forward";
import { replyToMessage, sendNewMessage } from "./service";
import { forwardMessageSchema, replyMessageSchema, sendMessageSchema } from "./validation";

export const sendRoutes = new Hono<HonoApp>();

sendRoutes.post("/send", async (c) => {
  const authContext = await requireMailApiContext(c.env, c.req.raw, "mail:send");
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
  const principal = { role: authContext.user.role, userId: authContext.user.id };
  const draft = input.draftId ? await getAccessibleDraft(c.env, principal, input.draftId) : null;
  await requireDraftAttachmentIdsAccess(c.env, principal, input.attachmentIds);
  const sent = draft?.forwardOfMessageId
    ? await sendForwardDraft(c.env, input, draft.id, draft.forwardOfMessageId, authContext.user.id)
    : await sendNewMessage(c.env, input, authContext.user.id);
  scheduleSentMailEvents(c.env, (promise) => c.executionCtx.waitUntil(promise), {
    draftId: input.draftId,
    mailboxId: mailbox.id,
    userId: authContext.user.id
  });
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
  const authContext = await requireMailApiContext(c.env, c.req.raw, "mail:send");
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "mail.reply",
    subject: authContext.user.id,
    limit: 60,
    windowSeconds: 60
  });
  const input = parseWith(replyMessageSchema, await readJson(c.req.raw));
  await requireMessageAccess(
    c.env.DB,
    authContext.user.id,
    authContext.user.role,
    input.messageId,
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
  const principal = { role: authContext.user.role, userId: authContext.user.id };
  await requireDraftIdAccess(c.env, principal, input.draftId);
  await requireDraftAttachmentIdsAccess(c.env, principal, input.attachmentIds);
  const sent = await replyToMessage(c.env, input, authContext.user.id);
  scheduleSentMailEvents(c.env, (promise) => c.executionCtx.waitUntil(promise), {
    draftId: input.draftId,
    mailboxId: mailbox.id,
    userId: authContext.user.id
  });
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

sendRoutes.post("/forward", async (c) => {
  const authContext = await requireMailApiContext(c.env, c.req.raw, "mail:send");
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "mail.forward",
    subject: authContext.user.id,
    limit: 60,
    windowSeconds: 60
  });
  const input = parseWith(forwardMessageSchema, await readJson(c.req.raw));
  await requireMessageAccess(
    c.env.DB,
    authContext.user.id,
    authContext.user.role,
    input.messageId,
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
  const principal = { role: authContext.user.role, userId: authContext.user.id };
  await requireDraftAttachmentIdsAccess(c.env, principal, input.attachmentIds);
  const sent = await forwardMessage(c.env, input, authContext.user.id);
  scheduleSentMailEvents(c.env, (promise) => c.executionCtx.waitUntil(promise), {
    mailboxId: mailbox.id,
    userId: authContext.user.id
  });
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "message.forward",
    resourceType: "mailbox",
    resourceId: mailbox.id,
    outcome: "success"
  });
  return c.json(sent, 201);
});
