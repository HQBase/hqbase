import { signUpOwnerUser } from "../../auth/user-actions";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { requireMailboxDomain } from "../../lib/validation";
import { createMailbox } from "../mailboxes/service";
import type { Mailbox } from "../mailboxes/types";

import {
  getSetupStatus,
  setChecklistAcknowledged,
  setPrimaryDomain,
  setSetupComplete
} from "./queries";
import type { BootstrapResult, SetupStatus } from "./types";

type BootstrapInput = {
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  primaryDomain: string;
  checklistAcknowledged: boolean;
  mailboxes: Array<{
    address: string;
    displayName: string;
  }>;
};

export async function bootstrapSetup(
  env: WorkerEnv,
  request: Request,
  input: BootstrapInput
): Promise<BootstrapResult> {
  const existing = await getSetupStatus(env.DB);
  if (existing.isComplete) {
    throw new AppError("SETUP_ALREADY_COMPLETE", "Setup is already complete.", 409);
  }
  if (existing.userCount > 0) {
    throw new AppError("SETUP_OWNER_EXISTS", "An owner user already exists.", 409);
  }

  for (const mailbox of input.mailboxes) {
    requireMailboxDomain(mailbox.address, input.primaryDomain);
  }

  const owner = await signUpOwnerUser(env, request, {
    email: input.ownerEmail,
    name: input.ownerName,
    password: input.ownerPassword,
    role: "owner"
  });

  await setPrimaryDomain(env.DB, input.primaryDomain);
  await setChecklistAcknowledged(env.DB, input.checklistAcknowledged);

  const mailboxes: Mailbox[] = [];
  for (const mailbox of input.mailboxes) {
    mailboxes.push(await createMailbox(env.DB, mailbox));
  }

  await completeSetupIfReady(env.DB);

  return {
    owner,
    mailboxes,
    setup: await getSetupStatus(env.DB)
  };
}

export async function completeSetupIfReady(db: D1Database): Promise<SetupStatus> {
  const status = await getSetupStatus(db);
  const canComplete =
    status.userCount > 0 &&
    status.primaryDomain !== null &&
    status.mailboxCount > 0 &&
    status.checklistAcknowledged;

  if (!canComplete) {
    throw new AppError(
      "SETUP_INCOMPLETE",
      "Setup requires an owner, primary domain, mailbox, and checklist acknowledgment.",
      400
    );
  }

  await setSetupComplete(db, true);
  return getSetupStatus(db);
}
