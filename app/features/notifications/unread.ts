import type { UnreadCounts } from "./types";

export function inboxUnreadForMailbox(unread: UnreadCounts, mailboxId: string): number {
  return mailboxId === "all" ? unread.inbox : (unread.inboxByMailbox[mailboxId] ?? 0);
}
