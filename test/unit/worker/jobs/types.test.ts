import { isJob } from "@worker/jobs/types";
import { describe, expect, it } from "vitest";

describe("HQBase job envelope", () => {
  it("accepts known bounded jobs and rejects malformed queue input", () => {
    expect(isJob({ id: "job_1", kind: "maintenance", requestedAt: "2026-07-11T00:00:00Z" })).toBe(
      true
    );
    expect(isJob(null)).toBe(false);
    expect(isJob({ id: "job_1", kind: "delete-everything", requestedAt: "now" })).toBe(false);
    expect(isJob({ kind: "maintenance", requestedAt: "now" })).toBe(false);
  });
});
