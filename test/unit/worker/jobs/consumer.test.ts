import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/db/drizzle", () => ({
  createDatabase: vi.fn(),
  getRow: vi.fn(),
  getRows: vi.fn()
}));
vi.mock("@worker/observability/log", () => ({ operationalLog: vi.fn() }));

import { createDatabase, getRow, getRows } from "@worker/db/drizzle";
import { consumeJobs, removeExpiredOrphanedObjects } from "@worker/jobs/consumer";
import type { Job } from "@worker/jobs/types";
import type { WorkerEnv } from "@worker/lib/env";

const now = Date.parse("2026-08-25T12:00:00.000Z");
const oneDay = 24 * 60 * 60 * 1_000;

function r2Object(key: string, uploaded: number) {
  return { key, uploaded: new Date(uploaded) };
}

describe("maintenance orphan cleanup", () => {
  const list = vi.fn();
  const deleteObjects = vi.fn();
  const env = {
    DB: {} as D1Database,
    MAIL_OBJECTS: { delete: deleteObjects, list }
  } as unknown as WorkerEnv;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("removes only expired, unreferenced objects across list pages", async () => {
    list
      .mockResolvedValueOnce({
        cursor: "page-2",
        delimitedPrefixes: [],
        objects: [
          r2Object("old-orphan", now - oneDay - 1),
          r2Object("old-reference", now - oneDay - 1),
          r2Object("age-boundary", now - oneDay)
        ],
        truncated: true
      })
      .mockResolvedValueOnce({
        delimitedPrefixes: [],
        objects: [
          r2Object("recent-orphan", now - oneDay + 1),
          r2Object("second-old-orphan", now - oneDay - 1)
        ],
        truncated: false
      });
    vi.mocked(getRow)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ found: 1 })
      .mockResolvedValueOnce(null);

    await expect(removeExpiredOrphanedObjects(env, now)).resolves.toBe(2);

    expect(list).toHaveBeenNthCalledWith(1, { limit: 1_000 });
    expect(list).toHaveBeenNthCalledWith(2, { cursor: "page-2", limit: 1_000 });
    expect(getRow).toHaveBeenCalledTimes(3);
    expect(deleteObjects).toHaveBeenCalledWith(["old-orphan", "second-old-orphan"]);
  });

  it("limits each maintenance run to 10,000 listed objects", async () => {
    let page = 0;
    list.mockImplementation(async (options: { cursor?: string; limit: number }) => {
      page += 1;
      const count = page === 1 ? options.limit - 1 : options.limit;
      return {
        cursor: `page-${page + 1}`,
        delimitedPrefixes: [],
        objects: Array.from({ length: count }, (_, index) =>
          r2Object(`recent-${page}-${index}`, now)
        ),
        truncated: true
      };
    });

    await expect(removeExpiredOrphanedObjects(env, now)).resolves.toBe(0);

    expect(list).toHaveBeenCalledTimes(11);
    expect(list).toHaveBeenLastCalledWith({ cursor: "page-11", limit: 1 });
    expect(getRow).not.toHaveBeenCalled();
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it("deletes orphan keys in R2 batches of at most 1,000", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) =>
      r2Object(`orphan-${index}`, now - oneDay - 1)
    );
    list
      .mockResolvedValueOnce({
        cursor: "page-2",
        delimitedPrefixes: [],
        objects: firstPage,
        truncated: true
      })
      .mockResolvedValueOnce({
        delimitedPrefixes: [],
        objects: [r2Object("orphan-1000", now - oneDay - 1)],
        truncated: false
      });
    vi.mocked(getRow).mockResolvedValue(null);

    await expect(removeExpiredOrphanedObjects(env, now)).resolves.toBe(1_001);

    expect(deleteObjects).toHaveBeenCalledTimes(2);
    expect(deleteObjects.mock.calls[0]?.[0]).toHaveLength(1_000);
    expect(deleteObjects.mock.calls[1]?.[0]).toEqual(["orphan-1000"]);
  });

  it("records the removed orphan count on maintenance runs", async () => {
    const insertRun = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const deleteRun = vi.fn().mockResolvedValue({ meta: { changes: 3 } });
    const updateRun = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const setUpdate = vi.fn((values: unknown) => ({
      where: () => ({ run: updateRun, values })
    }));
    vi.mocked(createDatabase).mockReturnValue({
      delete: () => ({ where: () => ({ run: deleteRun }) }),
      insert: () => ({
        values: () => ({ onConflictDoNothing: () => ({ run: insertRun }) })
      }),
      update: () => ({ set: setUpdate })
    } as never);
    vi.mocked(getRows).mockResolvedValue([]);
    list.mockResolvedValue({ delimitedPrefixes: [], objects: [], truncated: false });
    const ack = vi.fn();
    const retry = vi.fn();
    const job: Job = {
      id: "maintenance:2026-08-25",
      kind: "maintenance",
      requestedAt: "2026-08-25T12:00:00.000Z"
    };

    await consumeJobs(
      { messages: [{ ack, body: job, id: "queue-1", retry }] } as unknown as MessageBatch<Job>,
      env
    );

    expect(setUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        counters: { rateLimits: 3, removedR2Orphans: 0, retainedMessages: 0 },
        status: "succeeded"
      })
    );
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
});
