// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { MessageList } from "@/features/messages/message-list";
import type { ConversationSummary } from "@/features/messages/types";
import { renderComponent } from "../render-hook";

const conversation: ConversationSummary = {
  createdAt: "2026-07-30T12:00:00.000Z",
  direction: "inbound",
  folder: "inbox",
  fromAddress: "customer@example.com",
  hasAttachments: false,
  id: "message-1",
  isStarred: false,
  mailboxId: "mailbox-1",
  messageCount: 1,
  readAt: null,
  receivedAt: "2026-07-30T12:00:00.000Z",
  sentAt: null,
  snippet: "Please help",
  starredAt: null,
  subject: "Account access",
  threadId: "thread-1",
  to: ["support@example.com"],
  unreadCount: 1
};

describe("conversation list pagination", () => {
  it("loads the next page when the paging control approaches the scroll boundary", async () => {
    const onLoadMore = vi.fn();
    const disconnect = vi.fn();
    class VisibleIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        queueMicrotask(() => {
          callback([{ isIntersecting: true } as IntersectionObserverEntry], this);
        });
      }

      disconnect = disconnect;
      observe = vi.fn();
      root = null;
      rootMargin = "240px 0px";
      thresholds = [0];
      takeRecords = (): IntersectionObserverEntry[] => [];
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver);

    const rendered = await renderComponent(
      <MessageList
        activeFolder="inbox"
        conversations={[conversation]}
        hasMore={true}
        isLoadingMore={false}
        loadMoreError={null}
        selectedThreadId={null}
        onLoadMore={onLoadMore}
        onSelect={() => undefined}
      />
    );
    await Promise.resolve();

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(rendered.container.textContent).toContain("Load more conversations");
    await rendered.unmount();
    vi.unstubAllGlobals();
  });
});
