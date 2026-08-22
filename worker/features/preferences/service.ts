import { requireMailboxAccess } from "../../auth/mailbox-access";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { findMailboxById } from "../mailboxes/queries";
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
  const primaryCanSend = mailbox?.addresses.some(
    (address) => address.isPrimary && address.sendAvailable
  );
  if (!mailbox?.isActive || !primaryCanSend) {
    throw new AppError(
      "MAILBOX_NOT_SENDABLE",
      "Choose an active mailbox with a primary address that can send.",
      400
    );
  }
  await setDefaultFromMailboxId(db, input.userId, input.mailboxId);
}
