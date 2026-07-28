import type { MessageSummary } from "./types";

export type IncomingMessageSnapshot = {
  hasNewMessages: boolean;
  knownIds: Set<string>;
};

export function mergeIncomingMessageIds(
  knownIds: ReadonlySet<string> | null,
  messages: MessageSummary[]
): IncomingMessageSnapshot {
  const incomingIds = messages
    .filter((message) => message.direction === "inbound")
    .map((message) => message.id);
  const hasNewMessages =
    knownIds !== null && incomingIds.some((messageId) => !knownIds.has(messageId));

  return {
    hasNewMessages,
    knownIds: new Set([...(knownIds ?? []), ...incomingIds])
  };
}
