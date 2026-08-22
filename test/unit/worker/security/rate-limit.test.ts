import { enforceRateLimit } from "@worker/security/rate-limit";
import { describe, expect, it, vi } from "vitest";

function databaseReturning(requestCount: number | null): D1Database {
  const results = requestCount === null ? [] : [{ request_count: requestCount }];
  const all = vi.fn().mockResolvedValue({ results });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare } as unknown as D1Database;
}

describe("D1 rate limiting", () => {
  it("allows requests inside the window", async () => {
    await expect(
      enforceRateLimit(databaseReturning(3), "secret", {
        scope: "auth.email",
        subject: "User@Example.com",
        limit: 10,
        windowSeconds: 60
      })
    ).resolves.toBeUndefined();
  });

  it("returns a typed 429 after the limit", async () => {
    await expect(
      enforceRateLimit(databaseReturning(11), "secret", {
        scope: "auth.email",
        subject: "user@example.com",
        limit: 10,
        windowSeconds: 60
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("fails closed when D1 does not return the updated counter", async () => {
    await expect(
      enforceRateLimit(databaseReturning(null), "secret", {
        scope: "auth.email",
        subject: "user@example.com",
        limit: 10,
        windowSeconds: 60
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });
});
