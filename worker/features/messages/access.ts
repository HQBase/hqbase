import { sql } from "drizzle-orm";

import {
  canAccessUnassignedMail,
  type MailboxAccessLevel,
  requireMailboxAccess
} from "../../auth/mailbox-access";
import { getRow } from "../../db/drizzle";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";

type MessageAccessTarget = {
  is_unassigned: number;
  mailbox_id: string | null;
};

export async function requireMessageAccess(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null,
  messageId: string,
  required: MailboxAccessLevel
): Promise<MailboxAccessLevel> {
  const target = await getRow<MessageAccessTarget>(
    db,
    sql`SELECT mailbox_id, is_unassigned FROM messages WHERE id = ${messageId}`
  );
  return requireAccessTarget(db, principalId, role, target, required, "MESSAGE_NOT_FOUND");
}

export async function requireAttachmentAccess(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null,
  attachmentId: string,
  required: MailboxAccessLevel
): Promise<MailboxAccessLevel> {
  const target = await getRow<MessageAccessTarget>(
    db,
    sql`SELECT message.mailbox_id, message.is_unassigned
       FROM message_attachments attachment
       JOIN messages message ON message.id = attachment.message_id
       WHERE attachment.id = ${attachmentId}`
  );
  return requireAccessTarget(db, principalId, role, target, required, "ATTACHMENT_NOT_FOUND");
}

async function requireAccessTarget(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null,
  target: MessageAccessTarget | null,
  required: MailboxAccessLevel,
  notFoundCode: "ATTACHMENT_NOT_FOUND" | "MESSAGE_NOT_FOUND"
): Promise<MailboxAccessLevel> {
  if (!target) {
    const resource = notFoundCode === "MESSAGE_NOT_FOUND" ? "Message" : "Attachment";
    throw new AppError(notFoundCode, `${resource} not found.`, 404);
  }
  if (target.is_unassigned === 1) {
    if (canAccessUnassignedMail(role)) return "manager";
    throw new AppError("MAILBOX_FORBIDDEN", "You do not have access to this message.", 403);
  }
  if (target.mailbox_id === null) {
    const resource = notFoundCode === "MESSAGE_NOT_FOUND" ? "Message" : "Attachment";
    throw new AppError(notFoundCode, `${resource} not found.`, 404);
  }
  return requireMailboxAccess(db, principalId, role, target.mailbox_id, required);
}
