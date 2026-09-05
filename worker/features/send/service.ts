import type { MessageScope } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { findMailboxForSending } from "../mailboxes/queries";
import type { Mailbox } from "../mailboxes/types";
import { ensureReplySubject } from "../messages/headers";
import { getMessageDetail, listThreadMessages } from "../messages/queries";
import { storeMessageBody } from "../messages/text-storage";
import type { MessageSummary } from "../messages/types";
import type { SignatureSnapshot } from "../signatures/types";
import { assembleMessageBody, type MessageBodyPart } from "./body";
import {
  asEmailAttachment,
  loadAttachments,
  loadQuotedMessageHtml,
  maxAttachmentBytes,
  maxAttachmentCount,
  prepareAuthoredContent,
  prepareSignature,
  prepareStoredAttachments,
  requireAttachmentLimits,
  resolveAuthoredDraftId,
  type StoredOutgoingAttachment,
  totalAttachmentBytes
} from "./content-attachments";
import { deliverPreparedMail } from "./delivery";
import { identifySend, makeSendPayload, resumeSend, type SendIdentity } from "./operations";
import { buildReplyChainContext } from "./reply-body";
import type { ReplyMessageInput, SendMessageInput } from "./validation";

export async function sendNewMessage(
  env: WorkerEnv,
  input: SendMessageInput,
  principalId?: string,
  signature?: SignatureSnapshot,
  context?: MessageBodyPart,
  contextAttachments: StoredOutgoingAttachment[] = [],
  operationIdentity?: SendIdentity
): Promise<MessageSummary> {
  const mailbox = await ensureActiveMailbox(env.DB, input.from);
  const identity = operationIdentity ?? (await identifySend(principalId, input, "send"));
  const previous = await resumeSend(env, identity);
  if (previous) return previous;

  const timestamp = nowIso();
  const draftAttachments = await loadAttachments(env, input.attachmentIds, principalId);
  const authoredDraftId = resolveAuthoredDraftId(input.draftId, draftAttachments);
  const authored = prepareAuthoredContent({
    html: input.html,
    text: input.text,
    draftId: authoredDraftId,
    attachments: draftAttachments
  });
  const preparedDraftAttachments = prepareStoredAttachments(authored.attachments, timestamp);
  const preparedSignature = prepareSignature(signature, timestamp);
  const preparedContextAttachments = prepareStoredAttachments(contextAttachments, timestamp);
  const body = assembleMessageBody({
    authored: authored.body,
    signature: preparedSignature.snapshot,
    context
  });
  const attachments = [
    ...preparedDraftAttachments,
    ...preparedSignature.attachments,
    ...preparedContextAttachments
  ];
  requireAttachmentLimits(attachments);
  const email = {
    from: { name: mailbox.displayName, email: mailbox.address },
    to: input.to,
    subject: input.subject,
    text: body.text
  };
  const storedBody = await storeMessageBody(
    env.MAIL_OBJECTS,
    body.text,
    body.html,
    `sent/${timestamp.slice(0, 10)}/${newId("obj")}`
  );
  const payload = makeSendPayload(
    {
      threadId: newId("thr"),
      isUnassigned: false,
      mailboxId: mailbox.id,
      direction: "outbound",
      folder: "sent",
      fromAddress: input.from,
      fromName: mailbox.displayName,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      snippet: body.text.replace(/\s+/g, " ").trim().slice(0, 180),
      ...storedBody,
      rawR2Key: null,
      messageId: null,
      dedupeKey: null,
      inReplyTo: null,
      references: [],
      receivedAt: null,
      sentAt: timestamp,
      readAt: timestamp,
      hasAttachments: attachments.some((attachment) => attachment.disposition === "attachment")
    },
    attachments,
    true
  );
  return deliverPreparedMail(
    env,
    identity,
    payload,
    {
      ...email,
      ...(input.cc.length ? { cc: input.cc } : {}),
      ...(input.bcc.length ? { bcc: input.bcc } : {}),
      ...(body.html ? { html: body.html } : {}),
      ...(attachments.length ? { attachments: attachments.map(asEmailAttachment) } : {})
    },
    attachments
  );
}

export async function replyToMessage(
  env: WorkerEnv,
  input: ReplyMessageInput,
  principalId?: string,
  signature?: SignatureSnapshot,
  messageScope?: MessageScope
): Promise<MessageSummary> {
  const mailbox = await ensureActiveMailbox(env.DB, input.from);
  const identity = await identifySend(principalId, input, "reply");
  const previous = await resumeSend(env, identity);
  if (previous) return previous;

  const original = await getMessageDetail(env.DB, input.messageId, env.MAIL_OBJECTS);
  if (!original) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  const threadMessages = messageScope
    ? (await listThreadMessages(env.DB, original.threadId, messageScope, env.MAIL_OBJECTS)).filter(
        (message) => (message.folder === "trash") === (original.folder === "trash")
      )
    : [original];
  const targetIndex = threadMessages.findIndex((message) => message.id === original.id);
  const replyChain = targetIndex < 0 ? [original] : threadMessages.slice(0, targetIndex + 1);

  const timestamp = nowIso();
  const references = [...original.references, original.messageId].filter(
    (value): value is string => value !== null
  );
  const to = input.to?.length
    ? input.to
    : original.replyTo?.length
      ? original.replyTo
      : [original.fromAddress];
  if (to.length + input.cc.length + input.bcc.length > 50) {
    throw new AppError("RECIPIENTS_TOO_MANY", "Choose at most 50 total recipients.", 400);
  }
  const draftAttachments = await loadAttachments(env, input.attachmentIds, principalId);
  const authoredDraftId = resolveAuthoredDraftId(input.draftId, draftAttachments);
  const authored = prepareAuthoredContent({
    html: input.html,
    text: input.text,
    draftId: authoredDraftId,
    attachments: draftAttachments
  });
  const preparedDraftAttachments = prepareStoredAttachments(authored.attachments, timestamp);
  const preparedSignature = prepareSignature(signature, timestamp);
  const baseAttachments = [...preparedDraftAttachments, ...preparedSignature.attachments];
  requireAttachmentLimits(baseAttachments);
  const quoted =
    (authored.body.html || preparedSignature.snapshot?.html) && original.htmlAvailable
      ? await loadQuotedMessageHtml(
          env,
          original.id,
          original.attachments,
          maxAttachmentBytes - totalAttachmentBytes(baseAttachments),
          maxAttachmentCount - baseAttachments.length,
          replyChain.length === 1
        )
      : { html: undefined, inlineAttachments: [] };
  const signatureTextLength = preparedSignature.snapshot?.text.trim().length ?? 0;
  const context = buildReplyChainContext(
    replyChain,
    quoted.html,
    100_000 - input.text.trim().length - signatureTextLength - 4
  );
  const body = assembleMessageBody({
    authored: authored.body,
    signature: preparedSignature.snapshot,
    context:
      authored.body.html || preparedSignature.snapshot?.html ? context : { text: context.text }
  });
  const preparedQuotedAttachments = prepareStoredAttachments(quoted.inlineAttachments, timestamp);
  const outgoingAttachments = [...baseAttachments, ...preparedQuotedAttachments];
  requireAttachmentLimits(outgoingAttachments);
  const storedBody = await storeMessageBody(
    env.MAIL_OBJECTS,
    body.text,
    body.html,
    `sent/${timestamp.slice(0, 10)}/${newId("obj")}`
  );
  const payload = makeSendPayload(
    {
      threadId: original.threadId,
      isUnassigned: false,
      mailboxId: mailbox.id,
      direction: "outbound",
      folder: "sent",
      fromAddress: input.from,
      fromName: mailbox.displayName,
      to,
      cc: input.cc,
      bcc: input.bcc,
      subject: ensureReplySubject(original.subject),
      snippet: body.text.replace(/\s+/g, " ").trim().slice(0, 180),
      ...storedBody,
      rawR2Key: null,
      messageId: null,
      dedupeKey: null,
      inReplyTo: original.messageId,
      references,
      receivedAt: null,
      sentAt: timestamp,
      readAt: timestamp,
      hasAttachments: outgoingAttachments.some(
        (attachment) => attachment.disposition === "attachment"
      )
    },
    outgoingAttachments,
    false
  );
  return deliverPreparedMail(
    env,
    identity,
    payload,
    {
      from: { name: mailbox.displayName, email: mailbox.address },
      to,
      ...(input.cc.length ? { cc: input.cc } : {}),
      ...(input.bcc.length ? { bcc: input.bcc } : {}),
      subject: ensureReplySubject(original.subject),
      text: body.text,
      headers: {
        ...(original.messageId ? { "In-Reply-To": original.messageId } : {}),
        References: references.join(" ")
      },
      ...(body.html ? { html: body.html } : {}),
      ...(outgoingAttachments.length
        ? { attachments: outgoingAttachments.map(asEmailAttachment) }
        : {})
    },
    outgoingAttachments
  );
}

async function ensureActiveMailbox(db: D1Database, address: string): Promise<Mailbox> {
  const mailbox = await findMailboxForSending(db, address);
  if (!mailbox) {
    throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  }
  if (!mailbox.isActive) {
    throw new AppError("MAILBOX_DISABLED", "Disabled mailboxes cannot send email.", 400);
  }
  return mailbox;
}
