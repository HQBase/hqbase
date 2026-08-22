import { describe, expect, it } from "vitest";
import {
  conversationActivityTimestamp,
  conversationGroupKey,
  conversationGroupLabel,
  correspondentLabel,
  groupConversations
} from "@/features/messages/conversation-display";
import type { ConversationSummary } from "@/features/messages/types";

const now = new Date("2026-08-15T12:00:00.000Z");

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "message-1",
    threadId: "thread-1",
    mailboxId: "mailbox-1",
    direction: "inbound",
    folder: "inbox",
    fromAddress: "sender@example.com",
    to: ["me@example.com"],
    subject: "Subject",
    snippet: "Preview",
    receivedAt: "2026-08-15T10:00:00.000Z",
    sentAt: null,
    readAt: null,
    starredAt: null,
    hasAttachments: false,
    createdAt: "2026-08-15T10:00:00.000Z",
    isStarred: false,
    messageCount: 1,
    unreadCount: 0,
    ...overrides
  };
}

describe("conversation display helpers", () => {
  it("uses received, sent, then created timestamps", () => {
    expect(conversationActivityTimestamp(conversation())).toBe("2026-08-15T10:00:00.000Z");
    expect(
      conversationActivityTimestamp(
        conversation({ receivedAt: null, sentAt: "2026-08-14T10:00:00.000Z" })
      )
    ).toBe("2026-08-14T10:00:00.000Z");
    expect(
      conversationActivityTimestamp(
        conversation({ receivedAt: null, sentAt: null, createdAt: "2026-08-13T10:00:00.000Z" })
      )
    ).toBe("2026-08-13T10:00:00.000Z");
  });

  it("labels today, yesterday, and older month sections", () => {
    expect(conversationGroupKey("2026-08-15T10:00:00.000Z", now)).toBe("today");
    expect(conversationGroupLabel("2026-08-14T10:00:00.000Z", now)).toBe("Yesterday");
    expect(conversationGroupKey("2026-02-14T10:00:00.000Z", now)).toBe("2026-02");
    expect(conversationGroupLabel("2026-02-14T10:00:00.000Z", now)).toContain("2026");
  });

  it("falls back for missing senders and outbound recipients", () => {
    expect(correspondentLabel(conversation({ fromAddress: "" }))).toBe("Unknown sender");
    expect(correspondentLabel(conversation({ direction: "outbound", to: [] }))).toBe(
      "To: recipient"
    );
  });

  it("prefers display names when an address includes one", () => {
    expect(
      correspondentLabel(conversation({ fromAddress: "Alex at Acme Inc <alex@test.local>" }))
    ).toBe("Alex at Acme Inc");
    expect(
      correspondentLabel(
        conversation({ direction: "outbound", to: ['"Support" <support@example.com>'] })
      )
    ).toBe("To: Support");
  });

  it("keeps adjacent conversations in the same group", () => {
    const groups = groupConversations(
      [
        conversation({ id: "today-1", threadId: "today-1" }),
        conversation({
          id: "yesterday-1",
          threadId: "yesterday-1",
          receivedAt: "2026-08-14T09:00:00.000Z"
        }),
        conversation({
          id: "yesterday-2",
          threadId: "yesterday-2",
          receivedAt: "2026-08-14T08:00:00.000Z"
        })
      ],
      now
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.conversations).toHaveLength(1);
    expect(groups[1]?.conversations).toHaveLength(2);
  });
});
