import { describe, expect, it } from "vitest";

import { mergeIncomingMessageIds } from "@/features/messages/incoming-sound";
import type { MessageSummary } from "@/features/messages/types";

function message(id: string, direction: MessageSummary["direction"]): MessageSummary {
  return {
    id,
    threadId: `thread-${id}`,
    mailboxId: "mailbox-1",
    direction,
    folder: direction === "inbound" ? "inbox" : "sent",
    fromAddress: direction === "inbound" ? "sender@example.com" : "owner@example.com",
    to: [direction === "inbound" ? "owner@example.com" : "recipient@example.com"],
    subject: "Subject",
    snippet: "Snippet",
    receivedAt: direction === "inbound" ? "2026-07-28T12:00:00.000Z" : null,
    sentAt: direction === "outbound" ? "2026-07-28T12:00:00.000Z" : null,
    readAt: null,
    starredAt: null,
    hasAttachments: false,
    createdAt: "2026-07-28T12:00:00.000Z"
  };
}

describe("incoming mail sound detection", () => {
  it("primes silently, reports new inbound mail once, and ignores outbound mail", () => {
    const initial = mergeIncomingMessageIds(null, [
      message("inbound-1", "inbound"),
      message("outbound-1", "outbound")
    ]);

    expect(initial.hasNewMessages).toBe(false);
    expect([...initial.knownIds]).toEqual(["inbound-1"]);

    const changed = mergeIncomingMessageIds(initial.knownIds, [
      message("inbound-2", "inbound"),
      message("outbound-2", "outbound")
    ]);

    expect(changed.hasNewMessages).toBe(true);
    expect([...changed.knownIds]).toEqual(["inbound-1", "inbound-2"]);

    const repeated = mergeIncomingMessageIds(changed.knownIds, [
      message("inbound-1", "inbound"),
      message("inbound-2", "inbound")
    ]);

    expect(repeated.hasNewMessages).toBe(false);
  });
});
