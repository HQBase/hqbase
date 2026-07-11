import { signUpOwnerUser } from "../../auth/user-actions";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { upsertMailDomain } from "../domains/queries";
import { createMailbox } from "../mailboxes/service";
import type { Mailbox } from "../mailboxes/types";

import {
  getSetupStatus,
  setChecklistAcknowledged,
  setPrimaryDomain,
  setSetupComplete,
  upsertWorkspaceHost
} from "./queries";
import type { BootstrapResult, SetupStatus } from "./types";

type BootstrapInput = {
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  primaryDomain?: string | undefined;
  portalHostname?: string | undefined;
  serviceHostname?: string | undefined;
  emailDomains?:
    | Array<{
        name: string;
        zoneId?: string | null | undefined;
        accountId?: string | null | undefined;
      }>
    | undefined;
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

  const domains = input.emailDomains ?? [{ name: input.primaryDomain ?? "" }];
  if (!domains[0]?.name) throw new AppError("DOMAIN_REQUIRED", "Choose an email domain.", 400);

  for (const domain of domains) {
    await upsertMailDomain(env.DB, {
      ...domain,
      receivingStatus: "ready",
      sendingStatus: "ready",
      dnsStatus: "ready"
    });
  }

  const owner = await signUpOwnerUser(env, request, {
    email: input.ownerEmail,
    name: input.ownerName,
    password: input.ownerPassword,
    role: "owner"
  });

  await setPrimaryDomain(env.DB, domains[0].name);
  if (input.portalHostname) {
    await upsertWorkspaceHost(env.DB, {
      hostname: input.portalHostname,
      zoneId:
        domains.find((domain) => input.portalHostname?.endsWith(`.${domain.name}`))?.zoneId ?? null,
      kind: "portal",
      canonical: true
    });
  }
  if (input.serviceHostname) {
    await upsertWorkspaceHost(env.DB, {
      hostname: input.serviceHostname,
      zoneId:
        domains.find((domain) => input.serviceHostname?.endsWith(`.${domain.name}`))?.zoneId ??
        null,
      kind: "service",
      canonical: false
    });
  }
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
    status.domains.some((domain) => domain.isEnabled) &&
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
