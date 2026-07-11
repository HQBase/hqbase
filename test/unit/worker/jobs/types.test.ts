import { isProJob } from "@worker/jobs/types";
import { describe, expect, it } from "vitest";

describe("Pro job envelope", () => {
  it("accepts known bounded jobs and rejects malformed queue input", () => {
    expect(
      isProJob({ id: "job_1", kind: "maintenance", requestedAt: "2026-07-11T00:00:00Z" })
    ).toBe(true);
    expect(isProJob(null)).toBe(false);
    expect(isProJob({ id: "job_1", kind: "delete-everything", requestedAt: "now" })).toBe(false);
    expect(isProJob({ kind: "maintenance", requestedAt: "now" })).toBe(false);
  });
});
