import { nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import {
  addDraftAttachment,
  deleteDraft,
  removeDraftAttachment,
  saveDraft
} from "../drafts/queries";
import { findMailboxForSending } from "../mailboxes/queries";
import { getMessageDetail } from "../messages/queries";
import type { MessageDetail } from "../messages/types";
import type { SignatureSnapshot } from "../signatures/types";

import { assembleMessageBody } from "./body";
import {
  loadAttachments,
  loadQuotedMessageHtml,
  maxAttachmentBytes,
  maxAttachmentCount,
  prepareSignature,
  type StoredOutgoingAttachment,
  totalAttachmentBytes
} from "./content-attachments";
import { identifySend, resumeSend } from "./operations";
import { sendNewMessage } from "./service";
import type { ForwardMessageInput, SendMessageInput } from "./validation";

const maxForwardedAttachments = 20;

export async function forwardMessage(
  env: WorkerEnv,
  input: ForwardMessageInput,
  principalId: string,
  signature?: SignatureSnapshot
) {
  const identity = await identifySend(principalId, input, "forward");
  const previous = await resumeSend(env, identity);
  if (previous) return previous;
  const original = await getMessageDetail(env.DB, input.messageId, env.MAIL_OBJECTS);
  if (!original) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);

  const mailbox = await findMailboxForSending(env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  if (!mailbox.isActive) {
    throw new AppError("MAILBOX_DISABLED", "Disabled mailboxes cannot send email.", 400);
  }

  const subject = input.subject ?? forwardSubject(original.subject);
  const originalAttachments = forwardableAttachments(original.attachments);
  const outbound: SendMessageInput = {
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject,
    text: input.text,
    html: input.html,
    attachmentIds: input.attachmentIds,
    signature: input.signature
  };
  if (!input.includeOriginalAttachments || originalAttachments.length === 0) {
    const forwarded = await loadForwardedContext(
      env,
      original,
      input.attachmentIds,
      principalId,
      signature
    );
    return sendNewMessage(
      env,
      outbound,
      principalId,
      signature,
      forwarded.context,
      forwarded.inlineAttachments,
      identity
    );
  }

  requireForwardedAttachmentCount(originalAttachments.length, input.attachmentIds.length);

  const draft = await saveDraft(env.DB, principalId, {
    mailboxId: mailbox.id,
    replyToMessageId: null,
    forwardOfMessageId: original.id,
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject,
    text: input.text,
    html: input.html ?? "",
    signature,
    version: undefined
  });

  let copiedAttachmentIds: string[];
  try {
    copiedAttachmentIds = await copyOriginalAttachments(
      env,
      principalId,
      draft.id,
      originalAttachments
    );
  } catch (error) {
    await deleteDraft(env.DB, env.MAIL_OBJECTS, principalId, draft.id);
    throw error;
  }

  try {
    const attachmentIds = [...input.attachmentIds, ...copiedAttachmentIds];
    const forwarded = await loadForwardedContext(
      env,
      original,
      attachmentIds,
      principalId,
      signature
    );
    return await sendNewMessage(
      env,
      {
        ...outbound,
        attachmentIds
      },
      principalId,
      signature,
      forwarded.context,
      forwarded.inlineAttachments,
      identity
    );
  } finally {
    try {
      await deleteDraft(env.DB, env.MAIL_OBJECTS, principalId, draft.id);
    } catch {
      // The temporary draft must not change a completed delivery result.
    }
  }
}

export async function sendForwardDraft(
  env: WorkerEnv,
  input: SendMessageInput,
  draftId: string,
  originalMessageId: string,
  principalId: string,
  signature?: SignatureSnapshot
) {
  const identity = await identifySend(principalId, input, "send");
  const previous = await resumeSend(env, identity);
  if (previous) return previous;
  const original = await getMessageDetail(env.DB, originalMessageId, env.MAIL_OBJECTS);
  if (!original) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  const authored = stripLegacyForwardContext(input);
  const originalAttachments = forwardableAttachments(original.attachments);
  if (originalAttachments.length === 0) {
    const forwarded = await loadForwardedContext(
      env,
      original,
      input.attachmentIds,
      principalId,
      signature
    );
    return sendNewMessage(
      env,
      { ...input, ...authored, draftId },
      principalId,
      signature,
      forwarded.context,
      forwarded.inlineAttachments,
      identity
    );
  }

  requireForwardedAttachmentCount(originalAttachments.length, input.attachmentIds.length);
  const copiedAttachmentIds = await copyOriginalAttachments(
    env,
    principalId,
    draftId,
    originalAttachments
  );
  try {
    const attachmentIds = [...input.attachmentIds, ...copiedAttachmentIds];
    const forwarded = await loadForwardedContext(
      env,
      original,
      attachmentIds,
      principalId,
      signature
    );
    return await sendNewMessage(
      env,
      {
        ...input,
        ...authored,
        attachmentIds,
        draftId
      },
      principalId,
      signature,
      forwarded.context,
      forwarded.inlineAttachments,
      identity
    );
  } catch (error) {
    if (!(error instanceof AppError && error.code.startsWith("SEND_"))) {
      await removeCopiedAttachments(env, principalId, draftId, copiedAttachmentIds);
    }
    throw error;
  }
}

async function copyOriginalAttachments(
  env: WorkerEnv,
  principalId: string,
  draftId: string,
  attachments: MessageDetail["attachments"]
): Promise<string[]> {
  const copiedAttachmentIds: string[] = [];
  try {
    for (const attachment of attachments) {
      const object = await env.MAIL_OBJECTS.get(attachment.r2Key);
      if (!object) {
        throw new AppError(
          "ATTACHMENT_NOT_FOUND",
          "A forwarded attachment object is unavailable.",
          404
        );
      }
      const file = new File([await object.arrayBuffer()], attachment.filename, {
        type: attachment.contentType
      });
      const added = await addDraftAttachment(env.DB, principalId, draftId, file);
      copiedAttachmentIds.push(added.attachment.id);
      await env.MAIL_OBJECTS.put(added.r2Key, file.stream(), {
        httpMetadata: { contentType: added.attachment.contentType }
      });
    }
    return copiedAttachmentIds;
  } catch (error) {
    await removeCopiedAttachments(env, principalId, draftId, copiedAttachmentIds);
    throw error;
  }
}

function forwardableAttachments(
  attachments: MessageDetail["attachments"]
): MessageDetail["attachments"] {
  return attachments.filter((attachment) => attachment.disposition === "attachment");
}

async function removeCopiedAttachments(
  env: WorkerEnv,
  principalId: string,
  draftId: string,
  attachmentIds: string[]
): Promise<void> {
  for (const attachmentId of attachmentIds) {
    await removeDraftAttachment(env.DB, env.MAIL_OBJECTS, principalId, draftId, attachmentId);
  }
}

function requireForwardedAttachmentCount(originalCount: number, draftCount: number): void {
  if (originalCount + draftCount > maxForwardedAttachments) {
    throw new AppError(
      "ATTACHMENTS_TOO_MANY",
      "A forwarded message may contain at most 20 attachments.",
      400
    );
  }
}

export function forwardedBody(
  message: MessageDetail,
  noteText = "",
  noteHtml?: string
): { text: string; html: string } {
  const body = assembleMessageBody({
    authored: { text: noteText, html: noteHtml },
    context: forwardedContext(message)
  });
  return { text: body.text, html: body.html ?? "" };
}

export function forwardedContext(
  message: MessageDetail,
  forwardedHtml?: string
): { text: string; html: string } {
  const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
  const headers = [
    "---------- Forwarded message ---------",
    `From: ${message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress}`,
    `Date: ${new Date(timestamp).toUTCString()}`,
    `Subject: ${message.subject}`,
    `To: ${message.to.join(", ")}`,
    ...(message.cc.length ? [`Cc: ${message.cc.join(", ")}`] : [])
  ];
  const bodyText = message.textBody || message.snippet;
  const forwarded = [...headers, "", bodyText].join("\n");
  const htmlBody = forwardedHtml ?? escapeHtml(bodyText).replaceAll("\n", "<br>");
  return {
    text: forwarded,
    html: `<blockquote>${escapeHtml(headers.join("\n")).replaceAll("\n", "<br>")}<br><br>${htmlBody}</blockquote>`
  };
}

async function loadForwardedContext(
  env: WorkerEnv,
  message: MessageDetail,
  attachmentIds: string[],
  principalId: string,
  signature?: SignatureSnapshot
): Promise<{
  context: { text: string; html: string };
  inlineAttachments: StoredOutgoingAttachment[];
}> {
  if (!message.htmlAvailable) {
    return { context: forwardedContext(message), inlineAttachments: [] };
  }
  const authoredAttachments = await loadAttachments(env, attachmentIds, principalId);
  const signatureAttachments = prepareSignature(signature, nowIso()).attachments;
  const baseAttachments = [...authoredAttachments, ...signatureAttachments];
  const quoted = await loadQuotedMessageHtml(
    env,
    message.id,
    message.attachments,
    maxAttachmentBytes - totalAttachmentBytes(baseAttachments),
    maxAttachmentCount - baseAttachments.length
  );
  return {
    context: forwardedContext(message, quoted.html),
    inlineAttachments: quoted.inlineAttachments
  };
}

function stripLegacyForwardContext(input: Pick<SendMessageInput, "html" | "text">): {
  html?: string | undefined;
  text: string;
} {
  const marker = "---------- Forwarded message ---------";
  const markerIndex = input.text.lastIndexOf(marker);
  if (markerIndex < 0) return { text: input.text, html: input.html };
  const text = input.text.slice(0, markerIndex).trim();
  const html = stripFinalForwardBlockquote(input.html);
  return { text, ...(html ? { html } : {}) };
}

function stripFinalForwardBlockquote(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const markerIndex = html.lastIndexOf("Forwarded message");
  const blockStart = html.lastIndexOf("<blockquote", markerIndex);
  const closingTag = "</blockquote>";
  const blockEnd = html.indexOf(closingTag, markerIndex);
  if (
    markerIndex < 0 ||
    blockStart < 0 ||
    blockEnd < 0 ||
    html.slice(blockEnd + closingTag.length).trim()
  ) {
    return html;
  }
  return html.slice(0, blockStart).trim() || undefined;
}

function forwardSubject(subject: string): string {
  return `Fwd: ${subject.replace(/^(fw|fwd):\s*/i, "")}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
