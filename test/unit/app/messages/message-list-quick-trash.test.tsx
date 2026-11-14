// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { MessageList } from "@/features/messages/message-list";
import type { ConversationSummary } from "@/features/messages/types";
import { flushHookEffects, renderComponent } from "../render-hook";

vi.mock("@/lib/notification-sounds", () => ({ playNotificationSound: vi.fn(() => true) }));

function conversation(index: number, mailboxId = "mailbox-1"): ConversationSummary {
  return {
    createdAt: "2026-07-30T12:00:00.000Z",
    direction: "inbound",
    folder: "inbox",
    fromAddress: `customer-${index}@example.com`,
    hasAttachments: false,
    id: `message-${index}`,
    isStarred: false,
    mailboxId,
    messageCount: 1,
    readAt: null,
    receivedAt: "2026-07-30T12:00:00.000Z",
    sentAt: null,
    snippet: "Please help",
    starredAt: null,
    subject: `Subject ${index}`,
    threadId: `thread-${index}`,
    to: ["support@example.com"],
    unreadCount: 1
  };
}

async function renderList(options: {
  canOrganize?: (mailboxId: string | null) => boolean;
  conversations: ConversationSummary[];
  selected?: string[];
  withControls?: boolean;
}) {
  const onSelect = vi.fn();
  const onTrash = vi.fn();
  const onSelectionChange = vi.fn();
  const controls = options.withControls ?? true;
  const rendered = await renderComponent(
    <MessageList
      activeFolder="inbox"
      canOrganizeConversation={options.canOrganize ?? (() => true)}
      conversations={options.conversations}
      hasMore={false}
      isLoadingMore={false}
      loadMoreError={null}
      selectedThreadId={null}
      selectedThreadIds={controls ? new Set(options.selected ?? []) : undefined}
      onLoadMore={() => undefined}
      onRefresh={() => undefined}
      onSelect={onSelect}
      onSelectionChange={controls ? onSelectionChange : undefined}
      onToggleStar={() => undefined}
      onTrash={controls ? onTrash : undefined}
    />
  );
  return { ...rendered, onSelect, onSelectionChange, onTrash };
}

describe("conversation list quick Trash and selection", () => {
  it("moves one conversation to Trash from its row without opening it", async () => {
    const list = await renderList({ conversations: [conversation(1), conversation(2)] });
    const buttons = list.container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Move conversation to Trash"]'
    );
    expect(buttons).toHaveLength(2);

    await flushHookEffects(() => buttons[1]?.click());

    expect(list.onTrash).toHaveBeenCalledOnce();
    expect(list.onTrash.mock.calls[0]?.[0]).toMatchObject({ threadId: "thread-2" });
    expect(list.onSelect).not.toHaveBeenCalled();
    await list.unmount();
  });

  it("selects a row with its checkbox without opening the conversation", async () => {
    const list = await renderList({
      conversations: [conversation(1), conversation(2)],
      selected: ["thread-2"]
    });
    const checkboxes =
      list.container.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.getAttribute("aria-checked")).toBe("false");
    expect(checkboxes[1]?.getAttribute("aria-checked")).toBe("true");

    await flushHookEffects(() => checkboxes[0]?.click());
    await flushHookEffects(() => checkboxes[1]?.click());

    expect(
      list.onSelectionChange.mock.calls.map(([entry, selected]) => [entry.threadId, selected])
    ).toEqual([
      ["thread-1", true],
      ["thread-2", false]
    ]);
    expect(list.onSelect).not.toHaveBeenCalled();
    await list.unmount();
  });

  it("still opens the conversation from the rest of the row", async () => {
    const list = await renderList({ conversations: [conversation(1)] });

    await flushHookEffects(() => list.container.querySelector<HTMLAnchorElement>("a")?.click());

    expect(list.onSelect).toHaveBeenCalledOnce();
    expect(list.onTrash).not.toHaveBeenCalled();
    await list.unmount();
  });

  it("shows no controls for a mailbox the person cannot organize, or when the list has none", async () => {
    const restricted = await renderList({
      canOrganize: (mailboxId) => mailboxId === "mailbox-1",
      conversations: [conversation(1), conversation(2, "mailbox-read-only")]
    });
    expect(restricted.container.querySelectorAll('button[role="checkbox"]')).toHaveLength(1);
    expect(
      restricted.container.querySelectorAll('button[aria-label="Move conversation to Trash"]')
    ).toHaveLength(1);
    // Every row of a list that offers selection reserves the selection lane, so that columns align.
    const restrictedRows = restricted.container.querySelectorAll<HTMLAnchorElement>("a");
    expect(restrictedRows).toHaveLength(2);
    for (const row of restrictedRows) expect(row.className).toContain("sm:grid-cols-[3.5rem_");
    await restricted.unmount();

    const plain = await renderList({ conversations: [conversation(1)], withControls: false });
    expect(plain.container.querySelector('button[role="checkbox"]')).toBeNull();
    expect(
      plain.container.querySelector('button[aria-label="Move conversation to Trash"]')
    ).toBeNull();
    expect(plain.container.querySelector("a")?.className).toContain("sm:grid-cols-[2rem_");
    await plain.unmount();
  });
});
