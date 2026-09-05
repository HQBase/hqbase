import { sql } from "drizzle-orm";

import { newId, nowIso } from "../db/client";
import { createDatabase, getRow } from "../db/drizzle";
import { messageAttachments, messages } from "../db/schema";
import { getMessageDetail } from "../features/messages/queries";
import { attachmentValues, messageValues } from "../features/messages/storage";
import { searchTextProjection } from "../features/messages/text-storage";
import { resolveInboundThread } from "../features/messages/threading";
import type { MessageDetail, MessageSummary } from "../features/messages/types";

import { attachmentBody, attachmentSize } from "./attachments";
import { planInboundStorage } from "./inbound-plan";
import type { ParsedEmail } from "./parse-email";

export type StoreInboundInput = {
  envelopeRecipient: string;
  mailboxId: string | null;
  raw: ArrayBuffer;
  parsed: ParsedEmail;
};

export type StoreInboundResult =
  | { inserted: false; message: MessageDetail | MessageSummary }
  | { inserted: true; isUnassigned: boolean; message: MessageDetail | MessageSummary };

export async function storeInboundEmail(
  db: D1Database,
  bucket: R2Bucket,
  input: StoreInboundInput
): Promise<StoreInboundResult> {
  const recipient = input.envelopeRecipient.toLowerCase();
  const plan = planInboundStorage({
    envelopeRecipient: recipient,
    mailboxId: input.mailboxId,
    parsed: input.parsed
  });
  const dedupeKey = plan.dedupeKey;
  const duplicate = dedupeKey ? await findDuplicate(db, dedupeKey, bucket) : null;
  if (duplicate) {
    return { inserted: false, message: duplicate };
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

  const threadId = await resolveInboundThread(db, {
    inReplyTo: input.parsed.inReplyTo,
    lastMessageAt: timestamp,
    mailboxId: plan.mailboxId,
    references: input.parsed.references,
    subject: input.parsed.subject
  });
  const projection = searchTextProjection(input.parsed.textBody);
  const textR2Key = projection.truncated ? `${objectBase}/body.txt` : null;
  if (textR2Key) {
    await bucket.put(textR2Key, input.parsed.textBody, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" }
    });
  }
  const message = messageValues({
    threadId,
    isUnassigned: plan.isUnassigned,
    mailboxId: plan.mailboxId,
    direction: "inbound",
    folder: plan.folder,
    fromAddress: input.parsed.fromAddress,
    fromName: input.parsed.fromName,
    to: plan.to,
    cc: input.parsed.cc,
    bcc: input.parsed.bcc,
    subject: input.parsed.subject,
    snippet: input.parsed.snippet,
    textBody: projection.text,
    textR2Key,
    replyTo: input.parsed.replyTo ?? [],
    htmlR2Key,
    rawR2Key,
    messageId: input.parsed.messageId,
    dedupeKey: plan.dedupeKey,
    inReplyTo: input.parsed.inReplyTo,
    references: input.parsed.references,
    receivedAt: timestamp,
    sentAt: null,
    readAt: null,
    hasAttachments: hasDownloadableAttachments(input.parsed.attachments),
    deliveredToAddress: recipient
  });
  const attachments = [];
  for (const attachment of input.parsed.attachments) {
    const r2Key = `${objectBase}/attachments/${newId("att")}`;
    await bucket.put(r2Key, attachmentBody(attachment.content), {
      httpMetadata: { contentType: attachment.contentType }
    });
    attachments.push(
      attachmentValues({
        messageId: message.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachmentSize(attachment.content),
        contentId: attachment.contentId,
        disposition: messageAttachmentDisposition(attachment),
        r2Key
      })
    );
  }
  const database = createDatabase(db);
  const attachmentInserts = [];
  for (let start = 0; start < attachments.length; start += 8) {
    attachmentInserts.push(
      database.insert(messageAttachments).values(attachments.slice(start, start + 8))
    );
  }
  try {
    await database.batch([database.insert(messages).values(message), ...attachmentInserts]);
  } catch (error) {
    // A concurrent delivery can win the unique key. Its batch contains every attachment.
    // Keep staged objects on uncertain failures; maintenance removes only proven orphans.
    const winner = dedupeKey ? await findDuplicate(db, dedupeKey, bucket) : null;
    if (winner) return { inserted: false, message: winner };
    throw error;
  }

  const stored = await getMessageDetail(db, message.id, bucket);
  if (!stored) throw new Error("Committed inbound message could not be read.");
  return { inserted: true, isUnassigned: plan.isUnassigned, message: stored };
}

export function hasDownloadableAttachments(attachments: ParsedEmail["attachments"]): boolean {
  return attachments.some(
    (attachment) => messageAttachmentDisposition(attachment) === "attachment"
  );
}

function messageAttachmentDisposition(
  attachment: ParsedEmail["attachments"][number]
): "attachment" | "inline" {
  if (attachment.disposition === "attachment") return "attachment";
  return attachment.disposition === "inline" || attachment.contentId ? "inline" : "attachment";
}

async function findDuplicate(
  db: D1Database,
  dedupeKey: string,
  bucket: R2Bucket
): Promise<MessageSummary | null> {
  const row = await getRow<{ id: string }>(
    db,
    sql`SELECT id FROM messages WHERE dedupe_key = ${dedupeKey}`
  );

  if (!row) {
    return null;
  }

  return getMessageDetail(db, row.id, bucket);
}
