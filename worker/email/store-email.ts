import { newId, nowIso } from "../db/client";
import { findMailboxByAddress } from "../features/mailboxes/queries";
import {
  ensureThread,
  getMessageDetail,
  insertAttachment,
  insertMessage
} from "../features/messages/queries";
import type { MessageDetail, MessageSummary } from "../features/messages/types";

import { attachmentBody, attachmentSize } from "./attachments";
import { planInboundStorage } from "./inbound-plan";
import type { ParsedEmail } from "./parse-email";

export type StoreInboundInput = {
  envelopeRecipient: string;
  raw: ArrayBuffer;
  parsed: ParsedEmail;
};

export async function storeInboundEmail(
  db: D1Database,
  bucket: R2Bucket,
  input: StoreInboundInput
): Promise<MessageDetail | MessageSummary> {
  const recipient = input.envelopeRecipient.toLowerCase();
  const initialPlan = planInboundStorage({
    envelopeRecipient: recipient,
    mailboxId: null,
    parsed: input.parsed
  });
  const dedupeKey = initialPlan.dedupeKey;
  const duplicate = dedupeKey ? await findDuplicate(db, dedupeKey) : null;
  if (duplicate) {
    return duplicate;
  }

  const timestamp = input.parsed.date ?? nowIso();
  const objectBase = `messages/${timestamp.slice(0, 10)}/${newId("obj")}`;
  const rawR2Key = `${objectBase}/raw.eml`;
  await bucket.put(rawR2Key, input.raw, {
    httpMetadata: { contentType: "message/rfc822" }
  });

  const htmlR2Key = input.parsed.htmlBody ? `${objectBase}/body.html` : null;
  if (input.parsed.htmlBody && htmlR2Key) {
    await bucket.put(htmlR2Key, input.parsed.htmlBody, {
      httpMetadata: { contentType: "text/html; charset=utf-8" }
    });
  }

  const mailbox = await findMailboxByAddress(db, recipient);
  const plan = planInboundStorage({
    envelopeRecipient: recipient,
    mailboxId: mailbox?.id ?? null,
    parsed: input.parsed
  });
  const threadId = await ensureThread(db, input.parsed.subject, timestamp);
  const message = await insertMessage(db, {
    threadId,
    mailboxId: plan.mailboxId,
    direction: "inbound",
    folder: plan.folder,
    fromAddress: input.parsed.fromAddress,
    to: plan.to,
    cc: input.parsed.cc,
    bcc: input.parsed.bcc,
    subject: input.parsed.subject,
    snippet: input.parsed.snippet,
    textBody: input.parsed.textBody,
    htmlR2Key,
    rawR2Key,
    messageId: input.parsed.messageId,
    dedupeKey: plan.dedupeKey,
    inReplyTo: input.parsed.inReplyTo,
    references: input.parsed.references,
    receivedAt: timestamp,
    sentAt: null,
    readAt: null,
    hasAttachments: input.parsed.attachments.length > 0
  });

  for (const attachment of input.parsed.attachments) {
    const r2Key = `${objectBase}/attachments/${newId("att")}-${attachment.filename}`;
    await bucket.put(r2Key, attachmentBody(attachment.content), {
      httpMetadata: { contentType: attachment.contentType }
    });
    await insertAttachment(db, {
      messageId: message.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachmentSize(attachment.content),
      contentId: attachment.contentId,
      r2Key
    });
  }

  return (await getMessageDetail(db, message.id)) ?? message;
}

async function findDuplicate(db: D1Database, dedupeKey: string): Promise<MessageSummary | null> {
  const row = await db
    .prepare("SELECT id FROM messages WHERE dedupe_key = ?")
    .bind(dedupeKey)
    .first<{ id: string }>();

  if (!row) {
    return null;
  }

  return getMessageDetail(db, row.id);
}
