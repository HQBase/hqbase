import { and, eq, sql } from "drizzle-orm";

import { newId, nowIso } from "../../db/client";
import { createDatabase, getRows } from "../../db/drizzle";
import { drafts } from "../../db/schema";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { findMailboxForSending } from "../mailboxes/queries";
import type { Mailbox } from "../mailboxes/types";
import { ensureReplySubject } from "../messages/headers";
import { getMessageDetail, insertAttachment, insertMessage } from "../messages/queries";
import { createThread, touchThread } from "../messages/threading";
import type { MessageSummary } from "../messages/types";
import type { SignatureSnapshot } from "../signatures/types";
import {
  cleanupUnstoredObjectKeys,
  cleanupUnstoredObjects,
  deleteObjectKeys,
  sendWithStagedCleanup,
  stageOutgoingAttachments
} from "./attachment-storage";
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
import { buildReplyContext } from "./reply-body";
import type { ReplyMessageInput, SendMessageInput } from "./validation";

export async function sendNewMessage(
  env: WorkerEnv,
  input: SendMessageInput,
  principalId?: string,
  signature?: SignatureSnapshot,
  context?: MessageBodyPart
): Promise<MessageSummary> {
  const mailbox = await ensureActiveMailbox(env.DB, input.from);

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
  const body = assembleMessageBody({
    authored: authored.body,
    signature: preparedSignature.snapshot,
    context
  });
  const attachments = [...preparedDraftAttachments, ...preparedSignature.attachments];
  requireAttachmentLimits(attachments);
  const email = {
    from: { name: mailbox.displayName, email: mailbox.address },
    to: input.to,
    subject: input.subject,
    text: body.text
  };
  const stagedAttachments = [...preparedDraftAttachments, ...preparedSignature.attachments];
  await stageOutgoingAttachments(env.MAIL_OBJECTS, stagedAttachments);
  const sendResult = await sendWithStagedCleanup(
    env,
    {
      ...email,
      ...(input.cc.length ? { cc: input.cc } : {}),
      ...(input.bcc.length ? { bcc: input.bcc } : {}),
      ...(body.html ? { html: body.html } : {}),
      ...(attachments.length ? { attachments: attachments.map(asEmailAttachment) } : {})
    },
    stagedAttachments
  );
  try {
    const threadId = await createThread(env.DB, input.subject, timestamp);
    return await storeSentMessage(env, {
      ...input,
      fromName: mailbox.displayName,
      text: body.text,
      ...(body.html ? { html: body.html } : { html: undefined }),
      inReplyTo: null,
      messageId: sendResult.messageId,
      mailboxId: mailbox.id,
      references: [],
      sentAt: timestamp,
      subject: input.subject,
      threadId,
      storedAttachments: attachments,
      draftId: input.draftId ?? null,
      principalId: principalId ?? null
    });
  } catch (error) {
    await cleanupUnstoredObjects(env, stagedAttachments);
    throw error;
  }
}

export async function replyToMessage(
  env: WorkerEnv,
  input: ReplyMessageInput,
  principalId?: string,
  signature?: SignatureSnapshot
): Promise<MessageSummary> {
  const mailbox = await ensureActiveMailbox(env.DB, input.from);

  const original = await getMessageDetail(env.DB, input.messageId);
  if (!original) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }

  const timestamp = nowIso();
  const references = [...original.references, original.messageId].filter(
    (value): value is string => value !== null
  );
  const to = input.to?.length ? input.to : [original.fromAddress];
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
          maxAttachmentCount - baseAttachments.length
        )
      : { html: undefined, inlineAttachments: [] };
  const signatureTextLength = preparedSignature.snapshot?.text.trim().length ?? 0;
  const context = buildReplyContext(
    original,
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
  const stagedAttachments = [
    ...preparedDraftAttachments,
    ...preparedSignature.attachments,
    ...preparedQuotedAttachments
  ];
  await stageOutgoingAttachments(env.MAIL_OBJECTS, stagedAttachments);
  const sendResult = await sendWithStagedCleanup(
    env,
    {
      from: { name: mailbox.displayName, email: mailbox.address },
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
    },
    stagedAttachments
  );
  try {
    return await storeSentMessage(env, {
      from: input.from,
      fromName: mailbox.displayName,
      to,
      cc: input.cc,
      bcc: input.bcc,
      subject: ensureReplySubject(original.subject),
      text: body.text,
      ...(body.html ? { html: body.html } : {}),
      inReplyTo: original.messageId ?? original.id,
      messageId: sendResult.messageId,
      mailboxId: mailbox.id,
      references,
      sentAt: timestamp,
      threadId: original.threadId,
      storedAttachments: outgoingAttachments,
      draftId: input.draftId ?? null,
      principalId: principalId ?? null
    });
  } catch (error) {
    await cleanupUnstoredObjects(env, stagedAttachments);
    throw error;
  }
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

async function storeSentMessage(
  env: WorkerEnv,
  input: {
    from: string;
    fromName: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    text: string;
    html?: string | undefined;
    inReplyTo: string | null;
    messageId: string;
    mailboxId: string;
    references: string[];
    sentAt: string;
    threadId: string;
    storedAttachments: StoredOutgoingAttachment[];
    draftId: string | null;
    principalId: string | null;
  }
): Promise<MessageSummary> {
  const htmlR2Key = input.html ? `sent/${input.sentAt.slice(0, 10)}/${newId("html")}.html` : null;
  try {
    if (input.html && htmlR2Key) {
      await env.MAIL_OBJECTS.put(htmlR2Key, input.html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" }
      });
    }

    await touchThread(env.DB, input.threadId, input.sentAt);
    const message = await insertMessage(env.DB, {
      threadId: input.threadId,
      isUnassigned: false,
      mailboxId: input.mailboxId,
      direction: "outbound",
      folder: "sent",
      fromAddress: input.from,
      fromName: input.fromName,
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
      hasAttachments: input.storedAttachments.some(
        (attachment) => attachment.disposition === "attachment"
      )
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
    if (input.draftId && input.principalId) {
      const draftObjects = await getRows<{ r2_key: string }>(
        env.DB,
        sql`SELECT a.r2_key
            FROM draft_attachments a
            JOIN drafts d ON d.id = a.draft_id
            WHERE d.id = ${input.draftId} AND d.principal_id = ${input.principalId}`
      );
      await createDatabase(env.DB)
        .delete(drafts)
        .where(and(eq(drafts.id, input.draftId), eq(drafts.principalId, input.principalId)))
        .run();
      const retainedKeys = new Set(input.storedAttachments.map((attachment) => attachment.r2Key));
      const unusedKeys = draftObjects
        .map((object) => object.r2_key)
        .filter((key) => !retainedKeys.has(key));
      await deleteObjectKeys(env.MAIL_OBJECTS, unusedKeys);
    }
    return message;
  } catch (error) {
    if (htmlR2Key) await cleanupUnstoredObjectKeys(env, [htmlR2Key]);
    throw error;
  }
}
