import { findMailDomainByName } from "../features/domains/queries";
import {
  findMailboxForCatchAllReceiving,
  findMailboxForReceiving
} from "../features/mailboxes/queries";

export type InboundRoute = { action: "reject" } | { action: "store"; mailboxId: string | null };

export async function resolveInboundRoute(
  db: D1Database,
  envelopeRecipient: string
): Promise<InboundRoute> {
  const recipient = envelopeRecipient.trim().toLowerCase();
  const exactMailbox = await findMailboxForReceiving(db, recipient);
  if (exactMailbox) return { action: "store", mailboxId: exactMailbox.id };

  const domainName = recipient.slice(recipient.lastIndexOf("@") + 1);
  const domain = domainName ? await findMailDomainByName(db, domainName) : null;
  if (domain?.disconnectedAt) return { action: "reject" };
  if (!domain || domain.catchAllPolicy === "unassigned") {
    return { action: "store", mailboxId: null };
  }
  if (domain.catchAllPolicy === "reject") return { action: "reject" };

  const catchAllMailbox = domain.catchAllMailboxId
    ? await findMailboxForCatchAllReceiving(db, domain.catchAllMailboxId, domain.id)
    : null;
  return { action: "store", mailboxId: catchAllMailbox?.id ?? null };
}
