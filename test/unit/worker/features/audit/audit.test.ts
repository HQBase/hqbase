import { recordAudit } from "@worker/features/audit/service";
import { describe, expect, it } from "vitest";

describe("audit redaction guard", () => {
  it.each([
    "subject",
    "body",
    "email",
    "password",
    "token",
    "filename"
  ])("rejects %s metadata before touching storage", async (key) => {
    await expect(
      recordAudit(null as unknown as D1Database, {
        correlationId: "request_123",
        actorType: "system",
        action: "test",
        resourceType: "test",
        outcome: "success",
        metadata: { [key]: "sensitive" }
      })
    ).rejects.toThrow("Sensitive audit metadata");
  });
});
