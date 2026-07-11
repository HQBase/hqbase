import { operationalLog } from "@worker/observability/log";
import { describe, expect, it, vi } from "vitest";

describe("operational logging", () => {
  it("emits content-free structured fields", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);
    operationalLog("info", "job_succeeded", { jobId: "job_1", count: 2 });
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      event: "job_succeeded",
      jobId: "job_1",
      count: 2
    });
    output.mockRestore();
  });

  it.each([
    "password",
    "subject",
    "raw",
    "email",
    "filename",
    "token"
  ])("rejects the sensitive field %s", (key) => {
    expect(() => operationalLog("info", "unsafe", { [key]: "value" })).toThrow("Sensitive");
  });
});
