import { z } from "zod";

import { getRequiredSetting } from "../../db/client";
import { AppError } from "../../lib/errors";
import { requireMailboxDomain } from "../../lib/validation";

import { findMailboxByAddress, findMailboxById, insertMailbox, updateMailbox } from "./queries";
import type { CreateMailboxInput, Mailbox, UpdateMailboxInput } from "./types";

export async function createMailbox(db: D1Database, input: CreateMailboxInput): Promise<Mailbox> {
  const primaryDomain = await getRequiredSetting(db, "primary_domain", z.string());
  requireMailboxDomain(input.address, primaryDomain);

  const existing = await findMailboxByAddress(db, input.address);
  if (existing) {
    throw new AppError("MAILBOX_EXISTS", "A mailbox with this address already exists.", 409);
  }

  return insertMailbox(db, input);
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
