// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disableCurrentDeviceNotificationsBeforeSignOut: vi.fn()
}));

vi.mock("@/features/notifications/sign-out", () => ({
  disableCurrentDeviceNotificationsBeforeSignOut:
    mocks.disableCurrentDeviceNotificationsBeforeSignOut
}));

import { signOut } from "@/features/auth/api";
import { signOutStartedEvent } from "@/features/auth/sign-out-lifecycle";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sign-out lifecycle", () => {
  it("announces sign-out before notification cleanup and the delayed request", async () => {
    const order: string[] = [];
    const listener = () => order.push("event");
    window.addEventListener(signOutStartedEvent, listener);
    mocks.disableCurrentDeviceNotificationsBeforeSignOut.mockImplementation(() => {
      order.push("cleanup");
      return new Promise<void>(() => undefined);
    });
    const fetchMock = vi.fn(async () => {
      order.push("fetch");
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = signOut();
    expect(order).toEqual(["event", "cleanup"]);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(order).toEqual(["event", "cleanup", "fetch"]);

    window.removeEventListener(signOutStartedEvent, listener);
  });
});
