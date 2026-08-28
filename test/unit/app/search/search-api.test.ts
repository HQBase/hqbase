import { afterEach, describe, expect, it, vi } from "vitest";

import { searchWorkspace } from "@/features/search/api";

const emptyResults = { contacts: [], conversations: [], destinations: [], drafts: [] };

describe("global search API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the trimmed query, limit, credentials, and abort signal", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(emptyResults));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(
      searchWorkspace("  launch plan  ", { limit: 5, signal: controller.signal })
    ).resolves.toEqual(emptyResults);
    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=launch+plan&limit=5", {
      credentials: "include",
      method: "GET",
      signal: controller.signal
    });
  });

  it("uses the safe server message for a failed search", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ error: { message: "Search is too long." } }, { status: 400 })
        )
    );

    await expect(searchWorkspace("launch")).rejects.toThrow("Search is too long.");
  });
});
