import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import {
  addDraftAttachment,
  deleteDraft,
  removeDraftAttachment,
  saveDraft
} from "../drafts/queries";
import { findMailboxForSending } from "../mailboxes/queries";
import { getMessageDetail } from "../messages/queries";
import type { MessageDetail } from "../messages/types";

import { sendNewMessage } from "./service";
import { type ForwardMessageInput, type SendMessageInput, sendMessageSchema } from "./validation";

const maxForwardedAttachments = 20;

export async function forwardMessage(
  env: WorkerEnv,
  input: ForwardMessageInput,
  principalId: string
) {
  const original = await getMessageDetail(env.DB, input.messageId);
  if (!original) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);

  const mailbox = await findMailboxForSending(env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  if (!mailbox.isActive) {
    throw new AppError("MAILBOX_DISABLED", "Disabled mailboxes cannot send email.", 400);
  }

  const body = forwardedBody(original, input.text, input.html);
  const subject = input.subject ?? forwardSubject(original.subject);
  const outbound = parseWith(sendMessageSchema, {
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject,
    text: body.text,
    html: body.html,
    attachmentIds: input.attachmentIds
  });
  if (!input.includeOriginalAttachments || original.attachments.length === 0) {
    return sendNewMessage(env, outbound, principalId);
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
    text: body.text,
    html: body.html,
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
    parseWith(sendMessageSchema, {
      ...outbound,
      attachmentIds: [...input.attachmentIds, ...copiedAttachmentIds],
      draftId: draft.id
    }),
    principalId
  );
}

export async function sendForwardDraft(
  env: WorkerEnv,
  input: SendMessageInput,
  draftId: string,
  originalMessageId: string,
  principalId: string
) {
  const original = await getMessageDetail(env.DB, originalMessageId);
  if (!original) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  if (original.attachments.length === 0) {
    return sendNewMessage(env, { ...input, draftId }, principalId);
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
        attachmentIds: [...input.attachmentIds, ...copiedAttachmentIds],
        draftId
      },
      principalId
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
  const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
  const forwarded = [
    "---------- Forwarded message ---------",
    `From: ${message.fromAddress}`,
    `Date: ${new Date(timestamp).toUTCString()}`,
    `Subject: ${message.subject}`,
    `To: ${message.to.join(", ")}`,
    ...(message.cc.length ? [`Cc: ${message.cc.join(", ")}`] : []),
    "",
    message.textBody || message.snippet
  ].join("\n");
  const text = [noteText.trim(), forwarded].filter(Boolean).join("\n\n");
  const authoredHtml = noteHtml?.trim()
    ? noteHtml.trim()
    : noteText.trim()
      ? `<p>${escapeHtml(noteText.trim()).replaceAll("\n", "<br>")}</p>`
      : "";
  return {
    text,
    html: `${authoredHtml}<blockquote>${escapeHtml(forwarded).replaceAll("\n", "<br>")}</blockquote>`
  };
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
