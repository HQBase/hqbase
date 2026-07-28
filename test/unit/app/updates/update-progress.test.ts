import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginUpdateProgress,
  readUpdateProgress,
  UPDATE_STARTED_EVENT
} from "@/features/updates/update-progress";

describe("update progress", () => {
  let values: Map<string, string>;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    values = new Map();
    dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      dispatchEvent,
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value)
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains and announces an accepted build", () => {
    expect(beginUpdateProgress("build-123", 1_000)).toEqual({
      buildId: "build-123",
      startedAt: 1_000
    });
    expect(readUpdateProgress(2_000)).toEqual({
      buildId: "build-123",
      startedAt: 1_000
    });
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: UPDATE_STARTED_EVENT });
  });

  it("expires a stale build marker", () => {
    beginUpdateProgress("build-123", 1_000);
    expect(readUpdateProgress(31 * 60 * 1_000)).toBeNull();
    expect(values.size).toBe(0);
  });
});
