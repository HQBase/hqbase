import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyUnreadIndicators,
  serializePushSubscription,
  subscribeToPush
} from "@/features/notifications/browser";

describe("browser notifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets and clears the exact app badge and document title", async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { setAppBadge, clearAppBadge });
    vi.stubGlobal("document", { title: "" });

    await applyUnreadIndicators({
      catchall: 1,
      inbox: 2,
      inboxByMailbox: { "mailbox-1": 2 },
      total: 3
    });
    expect(document.title).toBe("(3) HQBase");
    expect(setAppBadge).toHaveBeenCalledWith(3);
    await applyUnreadIndicators({ catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 });
    expect(document.title).toBe("HQBase");
    expect(clearAppBadge).toHaveBeenCalledOnce();
  });

  it("requests permission only when subscribing and uses the VAPID application key", async () => {
    const subscription = {
      endpoint: "https://push.example/device",
      expirationTime: null,
      toJSON: () => ({
        endpoint: "https://push.example/device",
        expirationTime: null,
        keys: { auth: "auth", p256dh: "p256dh" }
      }),
      unsubscribe: vi.fn()
    } as unknown as PushSubscription;
    const subscribe = vi.fn().mockResolvedValue(subscription);
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("window", { Notification: {}, PushManager: {} });
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe }
        })
      }
    });

    await expect(subscribeToPush("AQIDBA")).resolves.toBe(subscription);
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith({
      applicationServerKey: new Uint8Array([1, 2, 3, 4]),
      userVisibleOnly: true
    });
  });

  it("rejects incomplete browser subscription keys", () => {
    const subscription = {
      toJSON: () => ({ endpoint: "https://push.example/device", keys: {} })
    } as unknown as PushSubscription;
    expect(() => serializePushSubscription(subscription)).toThrow("incomplete");
  });
});
