import { newId, nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { draftAttachmentObjects } from "../drafts/queries";
import { findAddressIdentity } from "../mailboxes/address-queries";
import { findMailboxForSending } from "../mailboxes/queries";
import { ensureReplySubject } from "../messages/headers";
import { sanitizeQuotedMessageHtml } from "../messages/html-sanitizer";
import { isSafeInlineImage } from "../messages/inline-media";
import {
  getMessageDetail,
  getMessageHtmlKey,
  insertAttachment,
  insertMessage
} from "../messages/queries";
import { createThread, touchThread } from "../messages/threading";
import type { MessageSummary, StoredAttachment } from "../messages/types";

import { buildReplyBody } from "./reply-body";
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
  const threadId = await createThread(env.DB, input.subject, timestamp);

  return storeSentMessage(env, {
    ...input,
    inReplyTo: null,
    messageId: sendResult.messageId,
    references: [],
    sentAt: timestamp,
    subject: input.subject,
    threadId,
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
  const to = input.to?.length ? input.to : [original.fromAddress];
  const attachments = await loadAttachments(env, input.attachmentIds, userId);
  const quoted =
    input.html && original.htmlAvailable
      ? await loadQuotedMessageHtml(
          env,
          original.id,
          original.attachments,
          maxAttachmentBytes - totalAttachmentBytes(attachments)
        )
      : { html: undefined, inlineAttachments: [] };
  const body = buildReplyBody(input, original, quoted.html);
  const outgoingAttachments = [...attachments, ...quoted.inlineAttachments];
  const sendResult = await env.MAIL_SENDER.send({
    from: input.from,
    to,
    ...(input.cc.length ? { cc: input.cc } : {}),
    ...(input.bcc.length ? { bcc: input.bcc } : {}),
    subject: ensureReplySubject(original.subject),
    text: body.text,
    headers: {
      "In-Reply-To": original.messageId ?? original.id,
      References: references.join(" ")
    },
    ...(body.html ? { html: body.html } : {}),
    ...(outgoingAttachments.length
      ? { attachments: outgoingAttachments.map(asEmailAttachment) }
      : {})
  });

  return storeSentMessage(env, {
    from: input.from,
    to,
    cc: input.cc,
    bcc: input.bcc,
    subject: ensureReplySubject(original.subject),
    text: body.text,
    ...(body.html ? { html: body.html } : {}),
    inReplyTo: original.messageId ?? original.id,
    messageId: sendResult.messageId,
    references,
    sentAt: timestamp,
    threadId: original.threadId,
    storedAttachments: outgoingAttachments,
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
    threadId: string;
    storedAttachments: StoredOutgoingAttachment[];
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

  await touchThread(env.DB, input.threadId, input.sentAt);
  const sendingIdentity = await findAddressIdentity(env.DB, input.from, "send");
  const message = await insertMessage(env.DB, {
    threadId: input.threadId,
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
      contentId: attachment.contentId,
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

const maxAttachmentBytes = 25 * 1024 * 1024;

type StoredDraftAttachment = Awaited<ReturnType<typeof draftAttachmentObjects>>[number];
type StoredOutgoingAttachment = StoredDraftAttachment & {
  contentId: string | null;
  disposition: "attachment" | "inline";
};

async function loadAttachments(
  env: WorkerEnv,
  ids: string[],
  userId?: string
): Promise<StoredOutgoingAttachment[]> {
  if (ids.length === 0) return [];
  if (!userId)
    throw new AppError("ATTACHMENTS_FORBIDDEN", "Attachments require a user session.", 403);
  return (await draftAttachmentObjects(env.DB, env.MAIL_OBJECTS, userId, ids)).map(
    (attachment) => ({
      ...attachment,
      contentId: null,
      disposition: "attachment"
    })
  );
}

async function loadQuotedMessageHtml(
  env: WorkerEnv,
  messageId: string,
  attachments: StoredAttachment[],
  availableBytes: number
): Promise<{ html?: string; inlineAttachments: StoredOutgoingAttachment[] }> {
  const htmlKey = await getMessageHtmlKey(env.DB, messageId);
  if (!htmlKey) return { inlineAttachments: [] };
  const htmlObject = await env.MAIL_OBJECTS.get(htmlKey);
  if (!htmlObject) return { inlineAttachments: [] };
  const sourceHtml = await htmlObject.text();
  const candidates = attachments.filter(
    (attachment) => attachment.contentId && isSafeInlineImage(attachment.contentType)
  );
  const referenced = new Set(
    sanitizeQuotedMessageHtml({ attachments: candidates, html: sourceHtml }).inlineAttachmentIds
  );
  let remainingBytes = Math.max(0, availableBytes);
  const selected = candidates.filter((attachment) => {
    if (!referenced.has(attachment.id) || attachment.sizeBytes > remainingBytes) return false;
    remainingBytes -= attachment.sizeBytes;
    return true;
  });
  const hydrated = (
    await Promise.all(
      selected.map(async (attachment): Promise<StoredOutgoingAttachment | null> => {
        const object = await env.MAIL_OBJECTS.get(attachment.r2Key);
        if (!object || !attachment.contentId) return null;
        return {
          id: attachment.id,
          filename: attachment.filename,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
          r2Key: attachment.r2Key,
          content: await object.arrayBuffer(),
          contentId: stripContentIdBrackets(attachment.contentId),
          disposition: "inline"
        };
      })
    )
  ).filter((attachment): attachment is StoredOutgoingAttachment => attachment !== null);
  const sanitized = sanitizeQuotedMessageHtml({ attachments: hydrated, html: sourceHtml });
  return { html: sanitized.html, inlineAttachments: hydrated };
}

function totalAttachmentBytes(attachments: StoredOutgoingAttachment[]): number {
  return attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0);
}

function stripContentIdBrackets(value: string): string {
  return value.trim().replace(/^<|>$/g, "");
}

function asEmailAttachment(attachment: StoredOutgoingAttachment): EmailAttachment {
  if (attachment.disposition === "inline" && attachment.contentId) {
    return {
      disposition: "inline",
      contentId: attachment.contentId,
      filename: attachment.filename,
      type: attachment.contentType,
      content: attachment.content
    };
  }
  return {
    disposition: "attachment",
    filename: attachment.filename,
    type: attachment.contentType,
    content: attachment.content
  };
}
