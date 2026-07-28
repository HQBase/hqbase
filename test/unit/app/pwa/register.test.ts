import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPwa } from "@/features/pwa/register";
import { UPDATE_STARTED_EVENT } from "@/features/updates/update-progress";

describe("PWA registration", () => {
  afterEach(() => {
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
});
