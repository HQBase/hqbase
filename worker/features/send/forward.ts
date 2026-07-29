import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import { addDraftAttachment, deleteDraft, saveDraft } from "../drafts/queries";
import { findMailboxForSending } from "../mailboxes/queries";
import { getMessageDetail } from "../messages/queries";
import type { MessageDetail } from "../messages/types";

import { sendNewMessage } from "./service";
import { type ForwardMessageInput, sendMessageSchema } from "./validation";

const maxForwardedAttachments = 20;

export async function forwardMessage(env: WorkerEnv, input: ForwardMessageInput, userId: string) {
  const original = await getMessageDetail(env.DB, input.messageId);
  if (!original) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);

  const mailbox = await findMailboxForSending(env.DB, input.from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);

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
    return sendNewMessage(env, outbound, userId);
  }

  if (original.attachments.length + input.attachmentIds.length > maxForwardedAttachments) {
    throw new AppError(
      "ATTACHMENTS_TOO_MANY",
      "A forwarded message may contain at most 20 attachments.",
      400
    );
  }

  const draft = await saveDraft(env.DB, userId, {
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

  const copiedAttachmentIds: string[] = [];
  try {
    for (const attachment of original.attachments) {
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
      const added = await addDraftAttachment(env.DB, userId, draft.id, file);
      await env.MAIL_OBJECTS.put(added.r2Key, file.stream(), {
        httpMetadata: { contentType: added.attachment.contentType }
      });
      copiedAttachmentIds.push(added.attachment.id);
    }
  } catch (error) {
    await deleteDraft(env.DB, env.MAIL_OBJECTS, userId, draft.id);
    throw error;
  }

  return sendNewMessage(
    env,
    parseWith(sendMessageSchema, {
      ...outbound,
      attachmentIds: [...input.attachmentIds, ...copiedAttachmentIds],
      draftId: draft.id
    }),
    userId
  );
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
