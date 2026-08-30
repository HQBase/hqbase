// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPwa } from "@/features/pwa/register";
import { PWA_UPDATE_READY_EVENT } from "@/features/pwa/update-ready";
import { UPDATE_STARTED_EVENT } from "@/features/updates/update-progress";

describe("PWA registration", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-hqbase-update-ready");
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("checks immediately and repeatedly after an HQBase update starts", async () => {
    const windowListeners = new Map<string, () => void>();
    const intervals: Array<{ callback: () => void; delay: number }> = [];
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = {
      addEventListener: vi.fn(),
      installing: null,
      update,
      waiting: null
    };
    vi.stubGlobal("window", {
      addEventListener: vi.fn((name: string, listener: () => void) => {
        windowListeners.set(name, listener);
      }),
      clearInterval: vi.fn(),
      location: { reload: vi.fn() },
      removeEventListener: vi.fn(),
      setInterval: vi.fn((callback: () => void, delay: number) => {
        intervals.push({ callback, delay });
        return intervals.length;
      })
    });
    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: {
        addEventListener: vi.fn(),
        controller: {},
        register: vi.fn().mockResolvedValue(registration),
        removeEventListener: vi.fn()
      }
    });

    const unregister = registerPwa({ onUpdateReady: vi.fn() });
    await Promise.resolve();
    windowListeners.get(UPDATE_STARTED_EVENT)?.();

    expect(update).toHaveBeenCalledOnce();
    const activeInterval = intervals.find(({ delay }) => delay === 10_000);
    expect(activeInterval).toBeDefined();
    activeInterval?.callback();
    expect(update).toHaveBeenCalledTimes(2);

    unregister();
  });

  it("announces when the replacement worker is ready", async () => {
    const onUpdateReady = vi.fn();
    const readyListener = vi.fn();
    const waiting = { postMessage: vi.fn() };
    const registration = {
      addEventListener: vi.fn(),
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      waiting
    };
    const serviceWorker = {
      addEventListener: vi.fn(),
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal("navigator", { onLine: true, serviceWorker });
    window.addEventListener(PWA_UPDATE_READY_EVENT, readyListener);

    const unregister = registerPwa({ onUpdateReady });
    await Promise.resolve();

    expect(onUpdateReady).toHaveBeenCalledOnce();
    expect(readyListener).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute("data-hqbase-update-ready")).toBe(true);

    unregister();
    window.removeEventListener(PWA_UPDATE_READY_EVENT, readyListener);
  });

  it("reloads when the waiting worker activated before the click", async () => {
    const onUpdateReady = vi.fn();
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
    const registration: {
      addEventListener: ReturnType<typeof vi.fn>;
      installing: null;
      update: ReturnType<typeof vi.fn>;
      waiting: { postMessage: ReturnType<typeof vi.fn> } | null;
    } = {
      addEventListener: vi.fn(),
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      waiting: { postMessage: vi.fn() }
    };
    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: {
        addEventListener: vi.fn(),
        controller: {},
        register: vi.fn().mockResolvedValue(registration),
        removeEventListener: vi.fn()
      }
    });

    const unregister = registerPwa({ onUpdateReady });
    await Promise.resolve();
    registration.waiting = null;
    onUpdateReady.mock.calls[0]?.[0].activate();

    expect(reload).toHaveBeenCalledOnce();
    unregister();
  });

  it("reloads when the waiting worker does not report activation", async () => {
    vi.useFakeTimers();
    const onUpdateReady = vi.fn();
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
    const waiting = { postMessage: vi.fn() };
    const registration = {
      addEventListener: vi.fn(),
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      waiting
    };
    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: {
        addEventListener: vi.fn(),
        controller: {},
        register: vi.fn().mockResolvedValue(registration),
        removeEventListener: vi.fn()
      }
    });

    const unregister = registerPwa({ onUpdateReady });
    await Promise.resolve();
    onUpdateReady.mock.calls[0]?.[0].activate();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reload).toHaveBeenCalledOnce();
    unregister();
  });
});
