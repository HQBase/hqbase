import { retryMailEventPublish } from "@worker/features/events/service";
import { describe, expect, it, vi } from "vitest";

describe("mail event publication", () => {
  it("retries a failed wake publication with bounded delays", async () => {
    const failure = new Error("event hub unavailable");
    const publish = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await retryMailEventPublish(publish, wait);

    expect(publish).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });

  it("returns after the first successful wake publication", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await retryMailEventPublish(publish, wait);

    expect(publish).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("reports failure after all three wake attempts", async () => {
    const failure = new Error("event hub unavailable");
    const publish = vi.fn().mockRejectedValue(failure);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(retryMailEventPublish(publish, wait)).rejects.toBe(failure);
    expect(publish).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });
});
