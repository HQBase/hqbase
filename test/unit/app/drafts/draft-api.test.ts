import { afterEach, describe, expect, it, vi } from "vitest";

import { listDrafts, uploadDraftAttachment } from "../../../../app/features/drafts/api";

describe("draft API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows every draft page from the Link header", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json([{ id: "drf_newer" }], {
          headers: {
            link: '<https://hqbase.test/api/v2/drafts?cursor=previous>; rel=prev; title="Older, drafts", <https://hqbase.test/api/v2/drafts?limit=100&cursor=next>; type="application/json"; rel="alternate next"'
          }
        })
      )
      .mockResolvedValueOnce(Response.json([{ id: "drf_older" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDrafts()).resolves.toEqual([{ id: "drf_newer" }, { id: "drf_older" }]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v2/drafts?limit=100", {
      credentials: "include",
      method: "GET"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://hqbase.test/api/v2/drafts?limit=100&cursor=next",
      { credentials: "include", method: "GET" }
    );
  });

  it("stops when a valid Link header has no next relation", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json([{ id: "drf_only" }], {
        headers: { link: "<https://hqbase.test/api/v2/drafts?cursor=previous>; rel=prev" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDrafts()).resolves.toEqual([{ id: "drf_only" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed non-empty Link header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        Response.json([{ id: "drf_only" }], {
          headers: { link: "not-a-link" }
        })
      )
    );

    await expect(listDrafts()).rejects.toThrow("Malformed Link header.");
  });

  it("marks an editor image as an inline draft attachment", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json(
        {
          id: "attachment-1",
          filename: "logo.png",
          contentType: "image/png",
          sizeBytes: 8,
          inline: true
        },
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "logo.png", { type: "image/png" });

    await uploadDraftAttachment("draft-1", file, true);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v2/drafts/draft-1/attachments");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    const form = init?.body as FormData;
    expect(form.get("file")).toBe(file);
    expect(form.get("inline")).toBe("true");
  });
});
