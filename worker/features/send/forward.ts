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
import { sendNewMessage } from "./service";
import type { ForwardMessageInput, SendMessageInput } from "./validation";

const maxForwardedAttachments = 20;

export async function forwardMessage(
  env: WorkerEnv,
  input: ForwardMessageInput,
  principalId: string,
  signature?: SignatureSnapshot
) {
  const original = await getMessageDetail(env.DB, input.messageId);
  if (!original) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);

  const mailbox = await findMailboxForSending(env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  if (!mailbox.isActive) {
    throw new AppError("MAILBOX_DISABLED", "Disabled mailboxes cannot send email.", 400);
  }

  const context = forwardedContext(original);
  const subject = input.subject ?? forwardSubject(original.subject);
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
  if (!input.includeOriginalAttachments || original.attachments.length === 0) {
    return sendNewMessage(env, outbound, principalId, signature, context);
  }

  requireForwardedAttachmentCount(original.attachments.length, input.attachmentIds.length);

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
      original.attachments
    );
  } catch (error) {
    await deleteDraft(env.DB, env.MAIL_OBJECTS, principalId, draft.id);
    throw error;
  }

  return sendNewMessage(
    env,
    {
      ...outbound,
      attachmentIds: [...input.attachmentIds, ...copiedAttachmentIds],
      draftId: draft.id
    },
    principalId,
    signature,
    context
  );
}

export async function sendForwardDraft(
  env: WorkerEnv,
  input: SendMessageInput,
  draftId: string,
  originalMessageId: string,
  principalId: string,
  signature?: SignatureSnapshot
) {
  const original = await getMessageDetail(env.DB, originalMessageId);
  if (!original) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  const authored = stripLegacyForwardContext(input);
  const context = forwardedContext(original);
  if (original.attachments.length === 0) {
    return sendNewMessage(env, { ...input, ...authored, draftId }, principalId, signature, context);
  }

  requireForwardedAttachmentCount(original.attachments.length, input.attachmentIds.length);
  const copiedAttachmentIds = await copyOriginalAttachments(
    env,
    principalId,
    draftId,
    original.attachments
  );
  try {
    return await sendNewMessage(
      env,
      {
        ...input,
        ...authored,
        attachmentIds: [...input.attachmentIds, ...copiedAttachmentIds],
        draftId
      },
      principalId,
      signature,
      context
    );
  } catch (error) {
    await removeCopiedAttachments(env, principalId, draftId, copiedAttachmentIds);
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

export function forwardedContext(message: MessageDetail): { text: string; html: string } {
  const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
  const forwarded = [
    "---------- Forwarded message ---------",
    `From: ${message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress}`,
    `Date: ${new Date(timestamp).toUTCString()}`,
    `Subject: ${message.subject}`,
    `To: ${message.to.join(", ")}`,
    ...(message.cc.length ? [`Cc: ${message.cc.join(", ")}`] : []),
    "",
    message.textBody || message.snippet
  ].join("\n");
  return {
    text: forwarded,
    html: `<blockquote>${escapeHtml(forwarded).replaceAll("\n", "<br>")}</blockquote>`
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
