import { afterEach, describe, expect, it, vi } from "vitest";

import { listDrafts } from "../../../../app/features/drafts/api";

describe("draft API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows every draft page from the Link header", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json([{ id: "drf_newer" }], {
          headers: {
            link: '<https://hqbase.test/api/v1/drafts?limit=100&cursor=next>; rel="next"'
          }
        })
      )
      .mockResolvedValueOnce(Response.json([{ id: "drf_older" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDrafts()).resolves.toEqual([{ id: "drf_newer" }, { id: "drf_older" }]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/drafts?limit=100", {
      credentials: "include",
      method: "GET"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://hqbase.test/api/v1/drafts?limit=100&cursor=next",
      { credentials: "include", method: "GET" }
    );
  });
});
