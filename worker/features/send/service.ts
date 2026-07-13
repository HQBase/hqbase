import { newId, nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { findMailboxByAddress } from "../mailboxes/queries";
import { ensureReplySubject } from "../messages/headers";
import { ensureThread, getMessageDetail, insertMessage } from "../messages/queries";
import type { MessageSummary } from "../messages/types";

import type { ReplyMessageInput, SendMessageInput } from "./validation";

export async function sendNewMessage(
  env: WorkerEnv,
  input: SendMessageInput
): Promise<MessageSummary> {
  await ensureActiveMailbox(env.DB, input.from);

  const timestamp = nowIso();
  const email = {
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text
  };
  const sendResult = await env.MAIL_SENDER.send({
    ...email,
    ...(input.cc.length ? { cc: input.cc } : {}),
    ...(input.bcc.length ? { bcc: input.bcc } : {}),
    ...(input.html ? { html: input.html } : {})
  });

  return storeSentMessage(env, {
    ...input,
    inReplyTo: null,
    messageId: sendResult.messageId,
    references: [],
    sentAt: timestamp,
    subject: input.subject
  });
}

export async function replyToMessage(
  env: WorkerEnv,
  input: ReplyMessageInput
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

  const sendResult = await env.MAIL_SENDER.send({
    from: input.from,
    to: [original.fromAddress],
    subject: ensureReplySubject(original.subject),
    text: input.text,
    headers: {
      "In-Reply-To": original.messageId ?? original.id,
      References: references.join(" ")
    },
    ...(input.html ? { html: input.html } : {})
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
    sentAt: timestamp
  });
}

async function ensureActiveMailbox(db: D1Database, address: string): Promise<void> {
  const mailbox = await findMailboxByAddress(db, address);
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
  }
): Promise<MessageSummary> {
  const mailbox = await findMailboxByAddress(env.DB, input.from);
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
  return insertMessage(env.DB, {
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
    hasAttachments: false
  });
}
