import { type Element, hasChildren, isTag, type Node } from "domhandler";
import { and, eq, sql } from "drizzle-orm";
import { DomUtils, parseDocument } from "htmlparser2";

import { newId, nowIso } from "../../db/client";
import { createDatabase, getRows } from "../../db/drizzle";
import { drafts } from "../../db/schema";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { draftAttachmentObjects } from "../drafts/queries";
import { findMailboxForSending } from "../mailboxes/queries";
import type { Mailbox } from "../mailboxes/types";
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
import { parseSignatureDataImage } from "../signatures/content";
import type { SignatureSnapshot } from "../signatures/types";

import { assembleMessageBody, type MessageBodyPart } from "./body";
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
  const preparedDraftAttachments = prepareDraftAttachments(authored.attachments, timestamp);
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
  const preparedDraftAttachments = prepareDraftAttachments(authored.attachments, timestamp);
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
  const outgoingAttachments = [...baseAttachments, ...quoted.inlineAttachments];
  requireAttachmentLimits(outgoingAttachments);
  const stagedAttachments = [...preparedDraftAttachments, ...preparedSignature.attachments];
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
}

const maxAttachmentBytes = 25 * 1024 * 1024;
const maxAttachmentCount = 20;

type StoredDraftAttachment = Awaited<ReturnType<typeof draftAttachmentObjects>>[number];
type StoredOutgoingAttachment = Omit<StoredDraftAttachment, "draftId"> & {
  contentId: string | null;
  disposition: "attachment" | "inline";
  draftId?: string | undefined;
};

async function loadAttachments(
  env: WorkerEnv,
  ids: string[],
  principalId?: string
): Promise<StoredOutgoingAttachment[]> {
  if (ids.length === 0) return [];
  if (!principalId)
    throw new AppError("ATTACHMENTS_FORBIDDEN", "Attachments require authentication.", 403);
  return (await draftAttachmentObjects(env.DB, env.MAIL_OBJECTS, principalId, ids)).map(
    (attachment) => ({
      ...attachment,
      contentId: attachment.contentId ? stripContentIdBrackets(attachment.contentId) : null,
      disposition: attachment.contentId ? "inline" : "attachment"
    })
  );
}

function resolveAuthoredDraftId(
  requestedDraftId: string | undefined,
  attachments: StoredOutgoingAttachment[]
): string | undefined {
  if (
    requestedDraftId &&
    attachments.some((attachment) => attachment.draftId !== requestedDraftId)
  ) {
    throw new AppError(
      "ATTACHMENT_DRAFT_MISMATCH",
      "All attachments must belong to the draft being sent.",
      400
    );
  }
  return requestedDraftId;
}

function prepareDraftAttachments(
  attachments: StoredOutgoingAttachment[],
  timestamp: string
): StoredOutgoingAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    draftId: undefined,
    r2Key: `sent/${timestamp.slice(0, 10)}/${newId("attachment")}-${index + 1}`
  }));
}

function prepareAuthoredContent(input: {
  html?: string | undefined;
  text: string;
  draftId?: string | undefined;
  attachments: StoredOutgoingAttachment[];
}): { body: MessageBodyPart; attachments: StoredOutgoingAttachment[] } {
  if (!input.html) {
    return {
      body: { text: input.text },
      attachments: input.attachments.filter((attachment) => attachment.disposition === "attachment")
    };
  }

  const document = parseDocument(input.html);
  const images = descendantImages(document.children);
  if (images.length === 0) {
    return {
      body: { text: input.text, html: input.html },
      attachments: input.attachments.filter((attachment) => attachment.disposition === "attachment")
    };
  }

  const attachmentsById = new Map(
    input.attachments.map((attachment) => [attachment.id, attachment] as const)
  );
  const referencedInlineIds = new Set<string>();
  for (const image of images) {
    const reference = draftInlineReference(image.attribs.src ?? "");
    if (!reference) {
      DomUtils.removeElement(image);
      continue;
    }
    const attachment = attachmentsById.get(reference.attachmentId);
    if (
      !attachment ||
      reference.draftId !== attachment.draftId ||
      (input.draftId !== undefined && attachment.draftId !== input.draftId) ||
      attachment.disposition !== "inline" ||
      !attachment.contentId ||
      !isSafeInlineImage(attachment.contentType)
    ) {
      throw new AppError(
        "INLINE_MEDIA_INVALID",
        "An inline image does not belong to this draft or is unavailable.",
        400
      );
    }
    image.attribs.src = `cid:${attachment.contentId}`;
    referencedInlineIds.add(attachment.id);
  }

  return {
    body: { text: input.text, html: DomUtils.getInnerHTML(document) },
    attachments: input.attachments.filter(
      (attachment) =>
        attachment.disposition === "attachment" || referencedInlineIds.has(attachment.id)
    )
  };
}

function descendantImages(nodes: Node[]): Element[] {
  const images: Element[] = [];
  const visit = (node: Node): void => {
    if (isTag(node) && node.name === "img") images.push(node);
    if (hasChildren(node)) node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return images;
}

function draftInlineReference(source: string): { attachmentId: string; draftId: string } | null {
  const match = /^\/api\/v(?:1|2)\/drafts\/([^/?#]+)\/attachments\/([^/?#]+)\/inline$/u.exec(
    source.trim()
  );
  if (!match?.[1] || !match[2]) return null;
  try {
    return { draftId: decodeURIComponent(match[1]), attachmentId: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function prepareSignature(
  signature: SignatureSnapshot | undefined,
  timestamp: string
): { snapshot?: SignatureSnapshot | undefined; attachments: StoredOutgoingAttachment[] } {
  if (!signature?.html) return { snapshot: signature, attachments: [] };
  const document = parseDocument(signature.html);
  const images = descendantImages(document.children);
  if (images.length === 0) return { snapshot: signature, attachments: [] };

  const attachments = images.map((image, index): StoredOutgoingAttachment => {
    const parsed = parseSignatureDataImage(image.attribs.src ?? "");
    const id = `${newId("inline")}-${index + 1}`;
    const extension = inlineImageExtension(parsed.contentType);
    const contentId = `${id}@hqbase.invalid`;
    image.attribs.src = `cid:${contentId}`;
    const content = parsed.bytes.slice().buffer;
    return {
      id,
      filename: `signature-image-${index + 1}.${extension}`,
      contentType: parsed.contentType,
      sizeBytes: parsed.bytes.byteLength,
      contentId,
      r2Key: `sent/${timestamp.slice(0, 10)}/${id}.${extension}`,
      content,
      disposition: "inline"
    };
  });
  return {
    snapshot: { ...signature, html: DomUtils.getInnerHTML(document) },
    attachments
  };
}

function inlineImageExtension(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  return contentType.slice("image/".length);
}

async function stageOutgoingAttachments(
  bucket: R2Bucket,
  attachments: StoredOutgoingAttachment[]
): Promise<void> {
  try {
    for (const attachment of attachments) {
      await bucket.put(attachment.r2Key, attachment.content, {
        httpMetadata: { contentType: attachment.contentType }
      });
    }
  } catch (error) {
    await cleanupStagedObjects(bucket, attachments);
    throw error;
  }
}

async function sendWithStagedCleanup(
  env: Pick<WorkerEnv, "MAIL_OBJECTS" | "MAIL_SENDER">,
  email: Parameters<SendEmail["send"]>[0],
  stagedAttachments: StoredOutgoingAttachment[]
): Promise<Awaited<ReturnType<SendEmail["send"]>>> {
  try {
    return await env.MAIL_SENDER.send(email);
  } catch (error) {
    await cleanupStagedObjects(env.MAIL_OBJECTS, stagedAttachments);
    throw error;
  }
}

async function cleanupStagedObjects(
  bucket: R2Bucket,
  attachments: StoredOutgoingAttachment[]
): Promise<void> {
  if (attachments.length === 0) return;
  await deleteObjectKeys(
    bucket,
    attachments.map((attachment) => attachment.r2Key)
  );
}

async function cleanupUnstoredObjects(
  env: Pick<WorkerEnv, "DB" | "MAIL_OBJECTS">,
  attachments: StoredOutgoingAttachment[]
): Promise<void> {
  if (attachments.length === 0) return;
  try {
    const referenced = await getRows<{ r2_key: string }>(
      env.DB,
      sql`SELECT r2_key FROM message_attachments
          WHERE r2_key IN (${sql.join(
            attachments.map((attachment) => sql`${attachment.r2Key}`),
            sql`, `
          )})`
    );
    const referencedKeys = new Set(referenced.map((attachment) => attachment.r2_key));
    await deleteObjectKeys(
      env.MAIL_OBJECTS,
      attachments.map((attachment) => attachment.r2Key).filter((key) => !referencedKeys.has(key))
    );
  } catch {
    // Keep objects when D1 cannot prove that they are unreferenced.
  }
}

async function deleteObjectKeys(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += 1_000) {
    await bucket.delete(keys.slice(start, start + 1_000)).catch(() => undefined);
  }
}

function requireAttachmentLimits(attachments: StoredOutgoingAttachment[]): void {
  if (attachments.length > maxAttachmentCount) {
    throw new AppError(
      "ATTACHMENTS_TOO_MANY",
      "A message may contain at most 20 attachments and inline images.",
      400
    );
  }
  if (totalAttachmentBytes(attachments) > maxAttachmentBytes) {
    throw new AppError("ATTACHMENTS_TOO_LARGE", "Attachments may total at most 25 MiB.", 413);
  }
}

async function loadQuotedMessageHtml(
  env: WorkerEnv,
  messageId: string,
  attachments: StoredAttachment[],
  availableBytes: number,
  availableCount: number
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
  let remainingCount = Math.max(0, availableCount);
  const selected = candidates.filter((attachment) => {
    if (
      !referenced.has(attachment.id) ||
      attachment.sizeBytes > remainingBytes ||
      remainingCount === 0
    ) {
      return false;
    }
    remainingBytes -= attachment.sizeBytes;
    remainingCount -= 1;
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
