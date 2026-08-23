import { requireMailboxAccess } from "../../auth/mailbox-access";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { findMailboxById, findMailboxForSending } from "../mailboxes/queries";
import { setDefaultFromMailboxId } from "./queries";

export async function updateDefaultFromMailbox(
  db: D1Database,
  input: {
    userId: string;
    role: WorkspaceRole;
    mailboxId: string;
  }
): Promise<void> {
  await requireMailboxAccess(db, input.userId, input.role, input.mailboxId, "agent");
  const mailbox = await findMailboxById(db, input.mailboxId);
  const sendable = mailbox ? await findMailboxForSending(db, mailbox.address) : null;
  if (!mailbox?.isActive || mailbox.deletedAt || !sendable) {
    throw new AppError(
      "MAILBOX_NOT_SENDABLE",
      "Choose an active mailbox on a domain that can send email.",
      400
    );
  }
  await setDefaultFromMailboxId(db, input.userId, input.mailboxId);
}
