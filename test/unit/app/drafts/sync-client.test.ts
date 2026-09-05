import { beforeEach, describe, expect, it, vi } from "vitest";
import { listDraftChanges, listDrafts } from "@/features/drafts/api";
import { createDraftSync } from "@/features/drafts/sync-client";
import type { Draft } from "@/features/drafts/types";

vi.mock("@/features/drafts/api", () => ({ listDraftChanges: vi.fn(), listDrafts: vi.fn() }));
const draft = (id: string, text = "") => ({ id, text, updatedAt: "2026-09-04T12:00:00Z" }) as Draft;
const page = (nextCursor: string, changes: unknown[] = [], hasMore = false) =>
  ({ nextCursor, changes, hasMore }) as Awaited<ReturnType<typeof listDraftChanges>>;
beforeEach(() => vi.resetAllMocks());
describe("draft journal cache", () => {
  it("replays changes during bootstrap, then reads only the journal", async () => {
    vi.mocked(listDrafts).mockResolvedValue([draft("a"), draft("b")]);
    vi.mocked(listDraftChanges)
      .mockResolvedValueOnce(page("10"))
      .mockResolvedValueOnce(
        page("12", [
          { type: "delete", draftId: "a" },
          { type: "upsert", draft: draft("b", "new text") }
        ])
      )
      .mockResolvedValueOnce(page("13", [{ type: "upsert", draft: draft("c") }]));
    const cache = createDraftSync();
    expect(await cache.refresh()).toEqual([draft("b", "new text")]);
    expect(await cache.refresh()).toEqual([draft("c"), draft("b", "new text")]);
    expect(listDrafts).toHaveBeenCalledOnce();
    expect(listDraftChanges).toHaveBeenLastCalledWith("12");
  });
  it("retries from the last committed cursor after a later page fails", async () => {
    vi.mocked(listDrafts).mockResolvedValue([draft("a")]);
    vi.mocked(listDraftChanges)
      .mockResolvedValueOnce(page("10"))
      .mockResolvedValueOnce(page("10"))
      .mockResolvedValueOnce(page("11", [{ type: "delete", draftId: "a" }], true))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page("12"));
    const cache = createDraftSync();
    await cache.refresh();
    await expect(cache.refresh()).rejects.toThrow("offline");
    expect(await cache.refresh()).toEqual([draft("a")]);
    expect(listDraftChanges).toHaveBeenLastCalledWith("10");
  });
  it("replaces cached access on a hard refresh", async () => {
    vi.mocked(listDrafts)
      .mockResolvedValueOnce([draft("a")])
      .mockResolvedValueOnce([]);
    vi.mocked(listDraftChanges).mockResolvedValue(page("10"));
    const cache = createDraftSync();
    await cache.refresh();
    expect(await cache.refresh(true)).toEqual([]);
    expect(listDrafts).toHaveBeenCalledTimes(2);
  });
});
