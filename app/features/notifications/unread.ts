import type { UnreadCounts } from "./types";

export function inboxUnreadForMailbox(unread: UnreadCounts, mailboxId: string): number {
  return mailboxId === "all" ? unread.inbox : (unread.inboxByMailbox[mailboxId] ?? 0);
}

export function mailboxUnreadLabel(label: string, mailboxId: string, unread: UnreadCounts): string {
  return `${label} (${inboxUnreadForMailbox(unread, mailboxId).toLocaleString()})`;
}
