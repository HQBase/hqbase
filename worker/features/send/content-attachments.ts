import { type Element, hasChildren, isTag, type Node } from "domhandler";
import { DomUtils, parseDocument } from "htmlparser2";

import { newId } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { draftAttachmentObjects } from "../drafts/attachment-lookups";
import { sanitizeQuotedMessageHtml } from "../messages/html-sanitizer";
import { isSafeInlineImage } from "../messages/inline-media";
import { getMessageHtmlKey } from "../messages/queries";
import type { StoredAttachment } from "../messages/types";
import { parseSignatureDataImage } from "../signatures/content";
import type { SignatureSnapshot } from "../signatures/types";

import type { MessageBodyPart } from "./body";

export const maxAttachmentBytes = 25 * 1024 * 1024;
export const maxAttachmentCount = 20;

type StoredDraftAttachment = Awaited<ReturnType<typeof draftAttachmentObjects>>[number];
export type StoredOutgoingAttachment = Omit<StoredDraftAttachment, "draftId"> & {
  contentId: string | null;
  disposition: "attachment" | "inline";
  draftId?: string | undefined;
};

export async function loadAttachments(
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

export function resolveAuthoredDraftId(
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

export function prepareStoredAttachments(
  attachments: StoredOutgoingAttachment[],
  timestamp: string
): StoredOutgoingAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    draftId: undefined,
    r2Key: `sent/${timestamp.slice(0, 10)}/${newId("attachment")}-${index + 1}`
  }));
}

export function prepareAuthoredContent(input: {
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

export function prepareSignature(
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

export function requireAttachmentLimits(attachments: StoredOutgoingAttachment[]): void {
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

export async function loadQuotedMessageHtml(
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

export function totalAttachmentBytes(attachments: StoredOutgoingAttachment[]): number {
  return attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0);
}

function stripContentIdBrackets(value: string): string {
  return value.trim().replace(/^<|>$/g, "");
}

export function asEmailAttachment(attachment: StoredOutgoingAttachment): EmailAttachment {
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
