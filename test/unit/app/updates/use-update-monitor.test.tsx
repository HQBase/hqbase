// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { announcePwaUpdateReady } from "@/features/pwa/update-ready";
import type { UpdateStatus } from "@/features/updates/types";
import { useUpdateMonitor } from "@/features/updates/use-update-monitor";
import { flushHookEffects, renderHook } from "../render-hook";

const mocks = vi.hoisted(() => ({
  getUpdateStatus: vi.fn()
}));

vi.mock("@/features/updates/api", () => ({
  getUpdateStatus: mocks.getUpdateStatus
}));

const status: UpdateStatus = {
  product: "hqbase",
  installedVersion: "0.1.22",
  installedSchemaVersion: 5,
  channel: "stable",
  checkedAt: "2026-07-29T00:00:00.000Z",
  available: true,
  compatible: true,
  repairRequired: false,
  release: {
    version: "0.1.23",
    schemaVersion: 5,
    publishedAt: "2026-07-29T00:00:00.000Z",
    notes: ["Add the next update."],
    notesUrl: "https://github.com/HQBase/hqbase/releases/tag/v0.1.23"
  }
};

describe("useUpdateMonitor", () => {
  beforeEach(() => {
    mocks.getUpdateStatus.mockReset();
    window.sessionStorage.clear();
  });

  it("checks while visible and removes refresh listeners when management is revoked", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    mocks.getUpdateStatus.mockResolvedValue(status);
    const hook = await renderHook(
      ({ canManage }: { canManage: boolean }) => {
        return useUpdateMonitor(canManage);
      },
      { canManage: true }
    );
    await flushHookEffects();

    expect(mocks.getUpdateStatus).toHaveBeenCalledOnce();
    expect(hook.result.status).toEqual(status);
    expect(hook.result.ready).toBe(false);
    await flushHookEffects(announcePwaUpdateReady);
    expect(hook.result.ready).toBe(true);
    await flushHookEffects(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.getUpdateStatus).toHaveBeenCalledTimes(2);

    await hook.rerender({ canManage: false });
    expect(hook.result.status).toBeNull();
    await flushHookEffects(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.getUpdateStatus).toHaveBeenCalledTimes(2);
    await hook.unmount();
    document.documentElement.removeAttribute("data-hqbase-update-ready");
  });

  it("clears update progress when the same release needs its second repair phase", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    mocks.getUpdateStatus.mockResolvedValue(status);
    const hook = await renderHook(() => useUpdateMonitor(true), undefined);
    await flushHookEffects();

    await flushHookEffects(() => hook.result.start("update-build", "update"));
    expect(hook.result.progress).toMatchObject({ buildId: "update-build", kind: "update" });

    const repairStatus: UpdateStatus = {
      ...status,
      installedVersion: status.release.version,
      repairRequired: true
    };
    await flushHookEffects(() => hook.result.acceptStatus(repairStatus));
    expect(hook.result.progress).toBeNull();

    await flushHookEffects(() => hook.result.start("repair-build", "repair"));
    await flushHookEffects(() => hook.result.acceptStatus(repairStatus));
    expect(hook.result.progress).toMatchObject({ buildId: "repair-build", kind: "repair" });

    await flushHookEffects(() =>
      hook.result.acceptStatus({ ...repairStatus, available: false, repairRequired: false })
    );
    expect(hook.result.progress).toBeNull();
    await hook.unmount();
  });
});
