import { AppError } from "../../lib/errors";
import { findMailDomainByName } from "../domains/queries";

import {
  deleteMailboxAddress,
  findMailboxByAddress,
  findMailboxById,
  insertMailbox,
  insertMailboxAddress,
  updateMailbox
} from "./queries";
import type {
  CreateMailboxAddressInput,
  CreateMailboxInput,
  Mailbox,
  MailboxAddress,
  UpdateMailboxInput
} from "./types";

export async function createMailbox(db: D1Database, input: CreateMailboxInput): Promise<Mailbox> {
  const domainName = input.address.split("@")[1] ?? "";
  const domain = await findMailDomainByName(db, domainName);
  if (!domain?.isEnabled) {
    throw new AppError("DOMAIN_NOT_REGISTERED", "Add and enable the email domain first.", 400);
  }

  const existing = await findMailboxByAddress(db, input.address);
  if (existing) {
    throw new AppError("MAILBOX_EXISTS", "A mailbox with this address already exists.", 409);
  }

  return insertMailbox(db, input, domain.id);
}

export async function createMailboxAddress(
  db: D1Database,
  mailboxId: string,
  input: CreateMailboxAddressInput
): Promise<MailboxAddress> {
  const mailbox = await findMailboxById(db, mailboxId);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Mailbox not found.", 404);
  const domain = await findMailDomainByName(db, input.address.split("@")[1] ?? "");
  if (!domain?.isEnabled) {
    throw new AppError("DOMAIN_NOT_REGISTERED", "Add and enable the email domain first.", 400);
  }
  if (await findMailboxByAddress(db, input.address)) {
    throw new AppError("MAILBOX_ADDRESS_EXISTS", "This email address is already in use.", 409);
  }
  return insertMailboxAddress(db, mailboxId, domain.id, input);
}

export async function removeMailboxAddress(
  db: D1Database,
  mailboxId: string,
  addressId: string
): Promise<void> {
  if (!(await deleteMailboxAddress(db, mailboxId, addressId))) {
    throw new AppError(
      "MAILBOX_ADDRESS_NOT_REMOVABLE",
      "Address not found or is the mailbox primary address.",
      409
    );
  }
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

  const updated = await updateMailbox(db, id, input);
  if (!updated) {
    throw new AppError("MAILBOX_NOT_FOUND", "Mailbox not found.", 404);
  }

  return updated;
}
