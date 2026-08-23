import type { Mailbox } from "./types";

export function mailboxDomains(mailboxes: Mailbox[]): string[] {
  return Array.from(new Set(mailboxes.map((mailbox) => mailbox.address.split("@")[1] ?? "")))
    .filter(Boolean)
    .sort();
}

export function mailboxMatchesDomain(mailbox: Mailbox, domain: string): boolean {
  return mailbox.address.endsWith(`@${domain}`);
}
