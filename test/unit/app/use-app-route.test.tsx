// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { useAppRoute } from "@/lib/use-app-route";
import { renderHook } from "./render-hook";

describe("application route normalization", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it.each([
    "/forgot-password?returnTo=%2Fdevice%3Fuser_code%3DABCD-EFGH",
    "/reset-password?token=reset-token&returnTo=%2Fdevice%3Fuser_code%3DABCD-EFGH",
    "/set-password?token=setup-token"
  ])("preserves the public authentication route %s", async (path) => {
    window.history.replaceState(null, "", path);

    const hook = await renderHook(() => useAppRoute(undefined), undefined);

    expect(`${window.location.pathname}${window.location.search}`).toBe(path);
    await hook.unmount();
  });

  it("continues to normalize an unknown app route to the inbox", async () => {
    window.history.replaceState(null, "", "/not-a-screen?source=test");

    const hook = await renderHook(() => useAppRoute(true), undefined);

    expect(`${window.location.pathname}${window.location.search}`).toBe("/mail/inbox?source=test");
    await hook.unmount();
  });
});
