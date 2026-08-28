import type { UnreadCounts } from "./types";

export function inboxUnreadForMailbox(unread: UnreadCounts, mailboxId: string): number {
  return mailboxId === "all" ? unread.inbox : (unread.inboxByMailbox[mailboxId] ?? 0);
}

export function mailDocumentTitle(
  unread: UnreadCounts,
  mailboxId: string,
  mailboxAddress?: string
): string {
  const count = inboxUnreadForMailbox(unread, mailboxId);
  const label = mailboxId === "all" ? "Inbox" : (mailboxAddress ?? "Inbox");
  return `${label}${count > 0 ? ` (${count})` : ""} - Mail`;
}
