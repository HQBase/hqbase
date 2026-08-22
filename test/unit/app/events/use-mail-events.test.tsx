// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMailEvents } from "@/features/events/use-mail-events";
import { flushHookEffects, renderHook } from "../render-hook";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;

  constructor(url: string | URL) {
    super();
    this.url = url.toString();
    FakeWebSocket.instances.push(this);
  }

  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close"));
  });

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

function handlers() {
  return {
    onDrafts: vi.fn(),
    onMailboxes: vi.fn(),
    onMessages: vi.fn(),
    onReconnect: vi.fn()
  };
}

describe("useMailEvents", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens one same-origin socket and coalesces wake events by topic", async () => {
    const callbacks = handlers();
    const hook = await renderHook(({ userId }) => useMailEvents(userId, callbacks), {
      userId: "user-1"
    });
    const socket = FakeWebSocket.instances[0];

    expect(socket?.url).toBe("ws://localhost:3000/api/v1/events");
    await flushHookEffects(() => socket?.open());
    expect(callbacks.onReconnect).toHaveBeenCalledOnce();

    await flushHookEffects(() => {
      socket?.message('{"type":"changed","topic":"messages"}');
      socket?.message('{"type":"changed","topic":"messages"}');
      socket?.message('{"type":"changed","topic":"drafts"}');
      socket?.message('{"type":"unknown","topic":"mailboxes"}');
      socket?.message("not-json");
    });

    expect(callbacks.onMessages).toHaveBeenCalledOnce();
    expect(callbacks.onDrafts).toHaveBeenCalledOnce();
    expect(callbacks.onMailboxes).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it("pauses while hidden and reconnects when the page becomes visible", async () => {
    const callbacks = handlers();
    const hook = await renderHook(({ userId }) => useMailEvents(userId, callbacks), {
      userId: "user-1"
    });
    const first = FakeWebSocket.instances[0];
    await flushHookEffects(() => first?.open());

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    await flushHookEffects(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(first?.close).toHaveBeenCalledOnce();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    await flushHookEffects(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(FakeWebSocket.instances).toHaveLength(2);
    await hook.unmount();
  });

  it("uses the latest handlers without reopening the socket", async () => {
    const firstHandlers = handlers();
    const secondHandlers = handlers();
    const hook = await renderHook(({ callbacks }) => useMailEvents("user-1", callbacks), {
      callbacks: firstHandlers
    });
    const socket = FakeWebSocket.instances[0];
    await hook.rerender({ callbacks: secondHandlers });
    await flushHookEffects(() => socket?.message('{"type":"changed","topic":"mailboxes"}'));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(firstHandlers.onMailboxes).not.toHaveBeenCalled();
    expect(secondHandlers.onMailboxes).toHaveBeenCalledOnce();
    await hook.unmount();
  });

  it("backs off after an unexpected close", async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, "getRandomValues").mockImplementation((values) => {
      if (values instanceof Uint32Array) values[0] = 0;
      return values;
    });
    const hook = await renderHook(() => useMailEvents("user-1", handlers()), undefined);
    const first = FakeWebSocket.instances[0];
    await flushHookEffects(() => first?.close());

    await flushHookEffects(() => vi.advanceTimersByTime(999));
    expect(FakeWebSocket.instances).toHaveLength(1);
    await flushHookEffects(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2);
    await hook.unmount();
  });
});
