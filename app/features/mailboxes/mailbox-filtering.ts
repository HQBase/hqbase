import type { Mailbox } from "./types";

export function mailboxDomains(mailboxes: Mailbox[]): string[] {
  return Array.from(
    new Set(
      mailboxes.flatMap((mailbox) =>
        (mailbox.addresses.length ? mailbox.addresses : [{ address: mailbox.address }]).map(
          (identity) => identity.address.split("@")[1] ?? ""
        )
      )
    )
  )
    .filter(Boolean)
    .sort();
}

export function mailboxMatchesDomain(mailbox: Mailbox, domain: string): boolean {
  return (mailbox.addresses.length ? mailbox.addresses : [{ address: mailbox.address }]).some(
    (identity) => identity.address.endsWith(`@${domain}`)
  );
}
