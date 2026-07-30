// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { MessageList } from "@/features/messages/message-list";
import type { ConversationSummary } from "@/features/messages/types";
import { flushHookEffects, renderComponent } from "../render-hook";

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
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );
    await Promise.resolve();

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(rendered.container.textContent).toContain("Load more conversations");
    await rendered.unmount();
    vi.unstubAllGlobals();
  });

  it("refreshes only after a downward pull crosses the release threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const rendered = await renderComponent(
      <MessageList
        activeFolder="inbox"
        conversations={[conversation]}
        hasMore={false}
        isLoadingMore={false}
        loadMoreError={null}
        selectedThreadId={null}
        onLoadMore={() => undefined}
        onRefresh={onRefresh}
        onSelect={() => undefined}
      />
    );
    const scrollContainer = rendered.container.querySelector<HTMLDivElement>(".overscroll-contain");
    expect(scrollContainer).not.toBeNull();

    await flushHookEffects(() => {
      scrollContainer?.dispatchEvent(touchEvent("touchstart", 20, 100));
      scrollContainer?.dispatchEvent(touchEvent("touchmove", 20, 260));
      scrollContainer?.dispatchEvent(touchEvent("touchend"));
    });

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(rendered.container.textContent).toContain("Updated");
    await rendered.unmount();
  });
});

function touchEvent(type: string, clientX = 0, clientY = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientX, clientY }]
  });
  return event;
}
