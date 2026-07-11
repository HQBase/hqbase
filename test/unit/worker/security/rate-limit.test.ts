import { enforceRateLimit } from "@worker/security/rate-limit";
import { describe, expect, it, vi } from "vitest";

function databaseReturning(requestCount: number): D1Database {
  const first = vi.fn().mockResolvedValue({ request_count: requestCount });
  const bind = vi.fn().mockReturnValue({ first });
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
});
