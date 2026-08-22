import { afterEach, describe, expect, it, vi } from "vitest";
import { getRecentAuthentication } from "@/features/auth/recent-authentication-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recent authentication API", () => {
  it("forwards the caller's abort signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ recent: true }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRecentAuthentication(controller.signal)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/recent-authentication", {
      credentials: "include",
      method: "GET",
      signal: controller.signal
    });
  });
});
