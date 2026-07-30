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
  const primaryCanSend =
    mailbox?.addresses.length === 0 ||
    mailbox?.addresses.some((address) => address.isPrimary && address.sendEnabled);
  if (!mailbox?.isActive || !primaryCanSend) {
    throw new AppError(
      "MAILBOX_NOT_SENDABLE",
      "Choose an active mailbox with a send-enabled primary address.",
      400
    );
  }
  await setDefaultFromMailboxId(db, input.userId, input.mailboxId);
}
