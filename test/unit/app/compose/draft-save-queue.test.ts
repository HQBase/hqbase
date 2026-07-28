import { describe, expect, it, vi } from "vitest";
import { DraftSaveQueue } from "@/features/compose/draft-save-queue";

describe("draft save queue", () => {
  it("serializes saves and continues after a failed save", async () => {
    const queue = new DraftSaveQueue();
    let finishFirst: (() => void) | undefined;
    const order: string[] = [];
    const second = vi.fn(async () => {
      order.push("second");
      throw new Error("conflict");
    });
    const third = vi.fn(async () => {
      order.push("third");
      return "saved";
    });

    const firstPromise = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          order.push("first");
          finishFirst = resolve;
        })
    );
    const secondPromise = queue.enqueue(second);
    const thirdPromise = queue.enqueue(third);

    await Promise.resolve();
    expect(order).toEqual(["first"]);

    finishFirst?.();
    await firstPromise;
    await expect(secondPromise).rejects.toThrow("conflict");
    await expect(thirdPromise).resolves.toBe("saved");
    expect(order).toEqual(["first", "second", "third"]);
  });
});
