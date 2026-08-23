import { AppError } from "../../lib/errors";
import { findMailDomainByName } from "../domains/queries";

import { findMailboxById, insertMailbox, updateMailbox } from "./queries";
import type { CreateMailboxInput, Mailbox, UpdateMailboxInput } from "./types";

export async function createMailbox(db: D1Database, input: CreateMailboxInput): Promise<Mailbox> {
  const normalizedInput = { ...input, address: input.address.trim().toLowerCase() };
  const domainName = normalizedInput.address.split("@")[1] ?? "";
  const domain = await findMailDomainByName(db, domainName);
  if (!domain?.isEnabled) {
    throw new AppError("DOMAIN_NOT_REGISTERED", "Add and enable the email domain first.", 400);
  }

  const mailbox = await insertMailbox(db, normalizedInput, domain.id);
  if (!mailbox) {
    throw new AppError("MAILBOX_EXISTS", "A mailbox with this address already exists.", 409);
  }
  return mailbox;
}

export async function updateExistingMailbox(
  db: D1Database,
  id: string,
  input: UpdateMailboxInput
): Promise<Mailbox> {
  const existing = await findMailboxById(db, id);
  if (!existing) {
    throw new AppError("MAILBOX_NOT_FOUND", "Mailbox not found.", 404);
  }
  if (existing.deletedAt) {
    throw new AppError("MAILBOX_DELETED", "Restore the mailbox before changing it.", 409);
  }

  const updated = await updateMailbox(db, id, input);
  if (!updated) {
    throw new AppError("MAILBOX_NOT_FOUND", "Mailbox not found.", 404);
  }

  return updated;
}
