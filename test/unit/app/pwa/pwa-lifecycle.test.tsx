// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { PwaLifecycle } from "@/features/pwa/pwa-lifecycle";
import { flushHookEffects, renderComponent } from "../render-hook";

const mocks = vi.hoisted(() => ({
  onUpdateReady: null as null | ((update: { activate: () => void }) => void),
  playNotificationSound: vi.fn(),
  registerPwa: vi.fn(
    ({ onUpdateReady }: { onUpdateReady: (update: { activate: () => void }) => void }) => {
      mocks.onUpdateReady = onUpdateReady;
      return vi.fn();
    }
  )
}));

vi.mock("@/features/pwa/register", () => ({
  registerPwa: mocks.registerPwa
}));

vi.mock("@/lib/notification-sounds", () => ({
  playNotificationSound: mocks.playNotificationSound
}));

describe("PWA lifecycle", () => {
  it("plays one sound when the ready-to-reload notice appears", async () => {
    vi.stubEnv("PROD", true);
    const activate = vi.fn();
    const view = await renderComponent(<PwaLifecycle />);
    await flushHookEffects(() => mocks.onUpdateReady?.({ activate }));

    expect(view.container.textContent).toContain("A new version of HQBase is ready.");
    expect(view.container.textContent).toContain("Reload");
    expect(mocks.playNotificationSound).toHaveBeenCalledOnce();
    expect(mocks.playNotificationSound).toHaveBeenCalledWith("update-ready");

    await flushHookEffects(() => mocks.onUpdateReady?.({ activate }));
    expect(mocks.playNotificationSound).toHaveBeenCalledOnce();
    await view.unmount();
    vi.unstubAllEnvs();
  });
});
