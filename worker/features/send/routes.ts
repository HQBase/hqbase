import { Hono } from "hono";
import { requireMailApiPrincipal } from "../../auth/mail-api";
import { requireMailboxAccess } from "../../auth/mailbox-access";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { recordAudit } from "../audit/service";
import { getAccessibleDraft, requireDraftAttachmentIdsAccess } from "../drafts/access";
import { scheduleSentMailEvents } from "../events/service";
import { findMailboxForSending } from "../mailboxes/queries";
import { requireMessageAccess } from "../messages/access";
import { emptySignatureSnapshot, resolveSignatureSelection } from "../signatures/service";
import type { SignatureSnapshot } from "../signatures/types";

import { forwardMessage, sendForwardDraft } from "./forward";
import { replyToMessage, sendNewMessage } from "./service";
import { forwardMessageSchema, replyMessageSchema, sendMessageSchema } from "./validation";

export const sendRoutes = new Hono<HonoApp>();

sendRoutes.post("/send", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  const { principal } = auth;
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "mail.send",
    subject: principal.id,
    limit: 60,
    windowSeconds: 60
  });
  const input = parseWith(sendMessageSchema, await readJson(c.req.raw));
  const mailbox = await findMailboxForSending(c.env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  await requireMailboxAccess(c.env.DB, principal.id, principal.role, mailbox.id, "agent");
  const draftPrincipal = { id: principal.id, role: principal.role };
  const draft = input.draftId
    ? await getAccessibleDraft(c.env, draftPrincipal, input.draftId)
    : null;
  const signature = await signatureForSend(c.env.DB, principal, input, draft);
  await requireDraftAttachmentIdsAccess(c.env, draftPrincipal, input.attachmentIds);
  const sent = draft?.forwardOfMessageId
    ? await sendForwardDraft(
        c.env,
        input,
        draft.id,
        draft.forwardOfMessageId,
        principal.id,
        signature
      )
    : await sendNewMessage(c.env, input, principal.id, signature);
  scheduleSentMailEvents(c.env, (promise) => c.executionCtx.waitUntil(promise), {
    draftId: input.draftId,
    mailboxId: mailbox.id,
    userId: principal.id
  });
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: principal.type,
    actorId: principal.id,
    action: "message.send",
    resourceType: "mailbox",
    resourceId: mailbox.id,
    outcome: "success"
  });
  return c.json(sent, 201);
});

sendRoutes.post("/reply", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  const { principal } = auth;
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "mail.reply",
    subject: principal.id,
    limit: 60,
    windowSeconds: 60
  });
  const input = parseWith(replyMessageSchema, await readJson(c.req.raw));
  await requireMessageAccess(c.env.DB, principal.id, principal.role, input.messageId, "agent");
  const mailbox = await findMailboxForSending(c.env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  await requireMailboxAccess(c.env.DB, principal.id, principal.role, mailbox.id, "agent");
  const draftPrincipal = { id: principal.id, role: principal.role };
  const draft = input.draftId
    ? await getAccessibleDraft(c.env, draftPrincipal, input.draftId)
    : null;
  const signature = await signatureForSend(c.env.DB, principal, input, draft);
  await requireDraftAttachmentIdsAccess(c.env, draftPrincipal, input.attachmentIds);
  const sent = await replyToMessage(c.env, input, principal.id, signature);
  scheduleSentMailEvents(c.env, (promise) => c.executionCtx.waitUntil(promise), {
    draftId: input.draftId,
    mailboxId: mailbox.id,
    userId: principal.id
  });
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: principal.type,
    actorId: principal.id,
    action: "message.reply",
    resourceType: "mailbox",
    resourceId: mailbox.id,
    outcome: "success"
  });
  return c.json(sent, 201);
});

sendRoutes.post("/forward", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  const { principal } = auth;
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "mail.forward",
    subject: principal.id,
    limit: 60,
    windowSeconds: 60
  });
  const input = parseWith(forwardMessageSchema, await readJson(c.req.raw));
  await requireMessageAccess(c.env.DB, principal.id, principal.role, input.messageId, "agent");
  const mailbox = await findMailboxForSending(c.env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  await requireMailboxAccess(c.env.DB, principal.id, principal.role, mailbox.id, "agent");
  const draftPrincipal = { id: principal.id, role: principal.role };
  await requireDraftAttachmentIdsAccess(c.env, draftPrincipal, input.attachmentIds);
  const signature = await signatureForSend(c.env.DB, principal, input, null);
  const sent = await forwardMessage(c.env, input, principal.id, signature);
  scheduleSentMailEvents(c.env, (promise) => c.executionCtx.waitUntil(promise), {
    mailboxId: mailbox.id,
    userId: principal.id
  });
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: principal.type,
    actorId: principal.id,
    action: "message.forward",
    resourceType: "mailbox",
    resourceId: mailbox.id,
    outcome: "success"
  });
  return c.json(sent, 201);
});

async function signatureForSend(
  db: D1Database,
  principal: Awaited<ReturnType<typeof requireMailApiPrincipal>>["principal"],
  input: { from: string; signature?: Parameters<typeof resolveSignatureSelection>[3] | undefined },
  draft: Awaited<ReturnType<typeof getAccessibleDraft>> | null
): Promise<SignatureSnapshot> {
  if (draft) {
    if (draft.from.toLowerCase() !== input.from.toLowerCase()) {
      throw new AppError(
        "DRAFT_FROM_MISMATCH",
        "The send request does not match the draft From address.",
        400
      );
    }
    return draft.signature;
  }
  return input.signature
    ? resolveSignatureSelection(db, principal, input.from, input.signature)
    : emptySignatureSnapshot("none");
}
