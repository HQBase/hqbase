import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/db/drizzle", () => ({
  createDatabase: vi.fn(),
  getRow: vi.fn(),
  getRows: vi.fn()
}));

import { createDatabase, getRows } from "@worker/db/drizzle";
import { deleteDraft } from "@worker/features/drafts/queries";

describe("draft queries", () => {
  const deleteObjects = vi.fn();
  const deleteRun = vi.fn();
  const db = {} as D1Database;
  const bucket = { delete: deleteObjects } as unknown as R2Bucket;

  beforeEach(() => {
    vi.resetAllMocks();
    deleteObjects.mockResolvedValue(undefined);
    deleteRun.mockResolvedValue({ meta: { changes: 1 } });
    vi.mocked(createDatabase).mockReturnValue({
      delete: () => ({ where: () => ({ run: deleteRun }) })
    } as never);
  });

  it("deletes draft objects in R2 batches of at most 1,000", async () => {
    vi.mocked(getRows).mockResolvedValue(
      Array.from({ length: 1_001 }, (_value, index) => ({ r2_key: `drafts/object-${index}` }))
    );

    await expect(deleteDraft(db, bucket, "user-1", "draft-1")).resolves.toBe(true);

    expect(deleteObjects).toHaveBeenCalledTimes(2);
    expect(deleteObjects.mock.calls[0]?.[0]).toHaveLength(1_000);
    expect(deleteObjects.mock.calls[1]?.[0]).toEqual(["drafts/object-1000"]);
  });
});
