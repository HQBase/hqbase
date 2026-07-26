import { newId, nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { draftAttachmentObjects } from "../drafts/queries";
import { findAddressIdentity } from "../mailboxes/address-queries";
import { findMailboxForSending } from "../mailboxes/queries";
import { ensureReplySubject } from "../messages/headers";
import {
  ensureThread,
  getMessageDetail,
  insertAttachment,
  insertMessage
} from "../messages/queries";
import type { MessageSummary } from "../messages/types";

import type { ReplyMessageInput, SendMessageInput } from "./validation";

export async function sendNewMessage(
  env: WorkerEnv,
  input: SendMessageInput,
  userId?: string
): Promise<MessageSummary> {
  await ensureActiveMailbox(env.DB, input.from);

  const timestamp = nowIso();
  const email = {
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text
  };
  const attachments = await loadAttachments(env, input.attachmentIds, userId);
  const sendResult = await env.MAIL_SENDER.send({
    ...email,
    ...(input.cc.length ? { cc: input.cc } : {}),
    ...(input.bcc.length ? { bcc: input.bcc } : {}),
    ...(input.html ? { html: input.html } : {}),
    ...(attachments.length ? { attachments: attachments.map(asEmailAttachment) } : {})
  });

  return storeSentMessage(env, {
    ...input,
    inReplyTo: null,
    messageId: sendResult.messageId,
    references: [],
    sentAt: timestamp,
    subject: input.subject,
    storedAttachments: attachments,
    draftId: input.draftId ?? null,
    userId: userId ?? null
  });
}

export async function replyToMessage(
  env: WorkerEnv,
  input: ReplyMessageInput,
  userId?: string
): Promise<MessageSummary> {
  await ensureActiveMailbox(env.DB, input.from);

  const original = await getMessageDetail(env.DB, input.messageId);
  if (!original) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }

  const timestamp = nowIso();
  const references = [...original.references, original.messageId].filter(
    (value): value is string => value !== null
  );

  const attachments = await loadAttachments(env, input.attachmentIds, userId);
  const sendResult = await env.MAIL_SENDER.send({
    from: input.from,
    to: [original.fromAddress],
    subject: ensureReplySubject(original.subject),
    text: input.text,
    headers: {
      "In-Reply-To": original.messageId ?? original.id,
      References: references.join(" ")
    },
    ...(input.html ? { html: input.html } : {}),
    ...(attachments.length ? { attachments: attachments.map(asEmailAttachment) } : {})
  });

  return storeSentMessage(env, {
    from: input.from,
    to: [original.fromAddress],
    cc: [],
    bcc: [],
    subject: ensureReplySubject(original.subject),
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    inReplyTo: original.messageId ?? original.id,
    messageId: sendResult.messageId,
    references,
    sentAt: timestamp,
    storedAttachments: attachments,
    draftId: input.draftId ?? null,
    userId: userId ?? null
  });
}

async function ensureActiveMailbox(db: D1Database, address: string): Promise<void> {
  const mailbox = await findMailboxForSending(db, address);
  if (!mailbox) {
    throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  }
  if (!mailbox.isActive) {
    throw new AppError("MAILBOX_DISABLED", "Disabled mailboxes cannot send email.", 400);
  }
}

async function storeSentMessage(
  env: WorkerEnv,
  input: {
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    text: string;
    html?: string | undefined;
    inReplyTo: string | null;
    messageId: string;
    references: string[];
    sentAt: string;
    storedAttachments: StoredDraftAttachment[];
    draftId: string | null;
    userId: string | null;
  }
): Promise<MessageSummary> {
  const mailbox = await findMailboxForSending(env.DB, input.from);
  if (!mailbox) {
    throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  }

  const htmlR2Key = input.html ? `sent/${input.sentAt.slice(0, 10)}/${newId("html")}.html` : null;
  if (input.html && htmlR2Key) {
    await env.MAIL_OBJECTS.put(htmlR2Key, input.html, {
      httpMetadata: { contentType: "text/html; charset=utf-8" }
    });
  }

  const threadId = await ensureThread(env.DB, input.subject, input.sentAt);
  const sendingIdentity = await findAddressIdentity(env.DB, input.from, "send");
  const message = await insertMessage(env.DB, {
    threadId,
    mailboxId: mailbox.id,
    direction: "outbound",
    folder: "sent",
    fromAddress: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    snippet: input.text.replace(/\s+/g, " ").trim().slice(0, 180),
    textBody: input.text,
    htmlR2Key,
    rawR2Key: null,
    messageId: input.messageId,
    dedupeKey: null,
    inReplyTo: input.inReplyTo,
    references: input.references,
    receivedAt: null,
    sentAt: input.sentAt,
    readAt: input.sentAt,
    hasAttachments: input.storedAttachments.length > 0,
    sentFromAddressId: sendingIdentity?.address.id ?? null
  });
  for (const attachment of input.storedAttachments) {
    await insertAttachment(env.DB, {
      messageId: message.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      contentId: null,
      r2Key: attachment.r2Key
    });
  }
  if (input.draftId && input.userId) {
    await env.DB.prepare("DELETE FROM drafts WHERE id = ? AND user_id = ?")
      .bind(input.draftId, input.userId)
      .run();
  }
  return message;
}

type StoredDraftAttachment = Awaited<ReturnType<typeof draftAttachmentObjects>>[number];
async function loadAttachments(env: WorkerEnv, ids: string[], userId?: string) {
  if (ids.length === 0) return [];
  if (!userId)
    throw new AppError("ATTACHMENTS_FORBIDDEN", "Attachments require a user session.", 403);
  return draftAttachmentObjects(env.DB, env.MAIL_OBJECTS, userId, ids);
}
function asEmailAttachment(attachment: StoredDraftAttachment): EmailAttachment {
  return {
    disposition: "attachment",
    filename: attachment.filename,
    type: attachment.contentType,
    content: attachment.content
  };
}
