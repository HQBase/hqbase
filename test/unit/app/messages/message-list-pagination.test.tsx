// @vitest-environment happy-dom
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { MessageList } from "@/features/messages/message-list";
import type { ConversationSummary } from "@/features/messages/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const mocks = vi.hoisted(() => ({
  playNotificationSound: vi.fn(() => true)
}));

vi.mock("@/lib/notification-sounds", () => ({
  playNotificationSound: mocks.playNotificationSound
}));

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
    mocks.playNotificationSound.mockClear();
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
      scrollContainer?.dispatchEvent(touchEvent("touchmove", 20, 270));
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(mocks.playNotificationSound).toHaveBeenCalledOnce();
    expect(mocks.playNotificationSound).toHaveBeenCalledWith("refresh-pull");

    await flushHookEffects(() => {
      scrollContainer?.dispatchEvent(touchEvent("touchend"));
    });

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(rendered.container.textContent).toContain("Updated");
    expect(mocks.playNotificationSound.mock.calls).toEqual([
      ["refresh-pull"],
      ["refresh-complete"]
    ]);
    await rendered.unmount();
  });

  it("retries the pull cue on release when the first mobile gesture unlocks audio", async () => {
    mocks.playNotificationSound.mockClear();
    mocks.playNotificationSound.mockReturnValueOnce(false);
    const rendered = await renderComponent(
      <MessageList
        activeFolder="inbox"
        conversations={[conversation]}
        hasMore={false}
        isLoadingMore={false}
        loadMoreError={null}
        selectedThreadId={null}
        onLoadMore={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );
    const scrollContainer = rendered.container.querySelector<HTMLDivElement>(".overscroll-contain");

    await flushHookEffects(() => {
      scrollContainer?.dispatchEvent(touchEvent("touchstart", 20, 100));
      scrollContainer?.dispatchEvent(touchEvent("touchmove", 20, 260));
    });
    expect(mocks.playNotificationSound.mock.calls).toEqual([["refresh-pull"]]);

    await flushHookEffects(() => scrollContainer?.dispatchEvent(touchEvent("touchend")));
    expect(mocks.playNotificationSound.mock.calls).toEqual([
      ["refresh-pull"],
      ["refresh-pull"],
      ["refresh-complete"]
    ]);
    await rendered.unmount();
  });

  it("keeps a pull below the refresh threshold silent", async () => {
    mocks.playNotificationSound.mockClear();
    const onRefresh = vi.fn();
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

    await flushHookEffects(() => {
      scrollContainer?.dispatchEvent(touchEvent("touchstart", 20, 100));
      scrollContainer?.dispatchEvent(touchEvent("touchmove", 20, 180));
      scrollContainer?.dispatchEvent(touchEvent("touchend"));
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(mocks.playNotificationSound).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("clears the successful refresh state after two seconds when refreshed data rerenders", async () => {
    vi.useFakeTimers();

    function RefreshingList(): React.ReactElement {
      const [refreshCount, setRefreshCount] = React.useState(0);
      return (
        <div data-refresh-count={refreshCount}>
          <MessageList
            activeFolder="inbox"
            conversations={[conversation]}
            hasMore={false}
            isLoadingMore={false}
            loadMoreError={null}
            selectedThreadId={null}
            onLoadMore={() => undefined}
            onRefresh={() => setRefreshCount((count) => count + 1)}
            onSelect={() => undefined}
          />
        </div>
      );
    }

    const rendered = await renderComponent(<RefreshingList />);
    const scrollContainer = rendered.container.querySelector<HTMLDivElement>(".overscroll-contain");

    await flushHookEffects(() => {
      scrollContainer?.dispatchEvent(touchEvent("touchstart", 20, 100));
      scrollContainer?.dispatchEvent(touchEvent("touchmove", 20, 260));
      scrollContainer?.dispatchEvent(touchEvent("touchend"));
    });

    expect(rendered.container.firstElementChild?.getAttribute("data-refresh-count")).toBe("1");
    expect(rendered.container.textContent).toContain("Updated");

    await flushHookEffects(() => vi.advanceTimersByTime(1999));
    expect(rendered.container.textContent).toContain("Updated");

    await flushHookEffects(() => vi.advanceTimersByTime(1));
    expect(rendered.container.textContent).not.toContain("Updated");

    await rendered.unmount();
    vi.useRealTimers();
  });

  it("offers a compact floating route back to the top after meaningful scrolling", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
    const rendered = await renderComponent(
      <MessageList
        activeFolder="inbox"
        conversations={[conversation]}
        hasMore={false}
        isLoadingMore={false}
        loadMoreError={null}
        selectedThreadId={null}
        onLoadMore={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );
    const scrollContainer = rendered.container.querySelector<HTMLDivElement>(".overscroll-contain");
    const scrollToTop = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll to top"]'
    );
    const scrollTo = vi.fn();
    if (!scrollContainer || !scrollToTop) throw new Error("Expected the compact scroll controls.");
    scrollContainer.scrollTo = scrollTo;

    expect(scrollToTop.getAttribute("aria-hidden")).toBe("true");
    expect(scrollToTop.tabIndex).toBe(-1);

    scrollContainer.scrollTop = 321;
    await flushHookEffects(() => scrollContainer.dispatchEvent(new Event("scroll")));

    expect(scrollToTop.getAttribute("aria-hidden")).toBe("false");
    expect(scrollToTop.tabIndex).toBe(0);

    await flushHookEffects(() => scrollToTop.click());
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });

    scrollContainer.scrollTop = 0;
    await flushHookEffects(() => scrollContainer.dispatchEvent(new Event("scroll")));
    expect(scrollToTop.getAttribute("aria-hidden")).toBe("true");

    await rendered.unmount();
    vi.unstubAllGlobals();
  });
});

function touchEvent(type: string, clientX = 0, clientY = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientX, clientY }]
  });
  return event;
}
