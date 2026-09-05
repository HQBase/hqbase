import { getRows } from "@worker/db/drizzle";
import { scanObjectPage } from "@worker/jobs/object-scan";
import type { WorkerEnv } from "@worker/lib/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/db/drizzle", () => ({ getRow: vi.fn(), getRows: vi.fn() }));
const now = Date.parse("2026-08-25T12:00:00.000Z");
const day = 86_400_000;
const object = (key: string, age = day + 1) => ({ key, uploaded: new Date(now - age) });
describe("bounded maintenance object pages", () => {
  const list = vi.fn();
  const remove = vi.fn();
  const env = { DB: {}, MAIL_OBJECTS: { list, delete: remove } } as unknown as WorkerEnv;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getRows).mockResolvedValue([]);
  });
  it("keeps referenced objects and the full 24-hour upload grace period", async () => {
    list.mockResolvedValue({
      objects: [object("old"), object("referenced"), object("boundary", day), object("new", 1)],
      truncated: true,
      cursor: "next"
    });
    vi.mocked(getRows).mockResolvedValue([{ key: "referenced" }]);
    await expect(scanObjectPage(env, undefined, true, now)).resolves.toEqual({
      cursor: "next",
      counters: { r2ObjectsScanned: 4, removedR2Orphans: 1 }
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith(["old"]);
    expect(list).toHaveBeenCalledExactlyOnceWith({ limit: 1000 });
    expect(getRows).toHaveBeenCalledOnce();
  });
  it("can continue beyond 10,000 objects with one query and one delete per page", async () => {
    const keys = Array.from({ length: 1000 }, (_, index) => object(`object-${index}`));
    list.mockImplementation(({ cursor }: { cursor?: string }) => {
      const page = Number(cursor ?? 0);
      return { objects: keys, truncated: page < 10, cursor: String(page + 1) };
    });
    let cursor: string | undefined;
    let total = 0;
    do {
      const page = await scanObjectPage(env, cursor, true, now);
      cursor = page.cursor;
      total += page.counters.removedR2Orphans ?? 0;
    } while (cursor);
    expect(total).toBe(11000);
    expect(getRows).toHaveBeenCalledTimes(11);
    expect(remove.mock.calls.every(([page]) => page.length === 1000)).toBe(true);
  });
  it("does not delete anything when reference inspection fails", async () => {
    list.mockResolvedValue({ objects: [object("protected")], truncated: false });
    vi.mocked(getRows).mockRejectedValue(new Error("D1 unavailable"));
    await expect(scanObjectPage(env, undefined, true, now)).rejects.toThrow("D1 unavailable");
    expect(remove).not.toHaveBeenCalled();
  });
});
