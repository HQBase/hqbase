import type { ConversationSummary } from "./types";

export type ConversationGroup = {
  key: string;
  label: string;
  conversations: ConversationSummary[];
};

export function conversationActivityTimestamp(conversation: ConversationSummary): string | null {
  return conversation.receivedAt ?? conversation.sentAt ?? conversation.createdAt ?? null;
}

export function correspondentLabel(conversation: ConversationSummary): string {
  if (conversation.direction === "inbound") {
    return conversation.fromName?.trim() || conversation.fromAddress.trim() || "Unknown sender";
  }
  return `To: ${displayNameFromAddress(conversation.to[0] ?? "") || "recipient"}`;
}

export type DraftGroup = {
  key: string;
  label: string;
  drafts: import("@/features/drafts/types").Draft[];
};

export function groupDrafts(
  drafts: import("@/features/drafts/types").Draft[],
  now = new Date()
): DraftGroup[] {
  const groups: DraftGroup[] = [];
  for (const draft of drafts) {
    const key = conversationGroupKey(draft.updatedAt, now);
    const existing = groups.at(-1);
    if (existing?.key === key) {
      existing.drafts.push(draft);
      continue;
    }
    groups.push({
      key,
      label: conversationGroupLabel(draft.updatedAt, now),
      drafts: [draft]
    });
  }
  return groups;
}

function displayNameFromAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const named = trimmed.match(/^(?:"([^"]+)"|([^<]+?))\s*<([^>]+)>$/);
  if (named) return (named[1] ?? named[2] ?? "").trim();
  return trimmed;
}

export function conversationGroupKey(value: string | null, now = new Date()): string {
  const date = parseDate(value);
  if (!date) return "unknown";
  if (isSameLocalDay(date, now)) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) return "yesterday";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function conversationGroupLabel(value: string | null, now = new Date()): string {
  const key = conversationGroupKey(value, now);
  if (key === "today") return "Today";
  if (key === "yesterday") return "Yesterday";
  if (key === "unknown") return "Earlier";
  const date = parseDate(value);
  if (!date) return "Earlier";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

export function groupConversations(
  conversations: ConversationSummary[],
  now = new Date()
): ConversationGroup[] {
  const groups: ConversationGroup[] = [];
  for (const conversation of conversations) {
    const activity = conversationActivityTimestamp(conversation);
    const key = conversationGroupKey(activity, now);
    const existing = groups.at(-1);
    if (existing?.key === key) {
      existing.conversations.push(conversation);
      continue;
    }
    groups.push({
      key,
      label: conversationGroupLabel(activity, now),
      conversations: [conversation]
    });
  }
  return groups;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
