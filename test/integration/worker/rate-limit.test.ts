import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { enforceRateLimit } from "../../../worker/security/rate-limit";
import { applyCurrentMigrations } from "./current-migrations";

describe("rate limiting with D1", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM rate_limits").run();
  });

  it("reads the upsert RETURNING row and enforces the stored count", async () => {
    const input = {
      scope: "integration.rate-limit",
      subject: "person@example.com",
      limit: 1,
      windowSeconds: 60
    };

    await expect(enforceRateLimit(env.DB, "integration-secret", input)).resolves.toBeUndefined();
    await expect(enforceRateLimit(env.DB, "integration-secret", input)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429
    });

    const row = await env.DB.prepare("SELECT request_count FROM rate_limits WHERE scope = ?")
      .bind(input.scope)
      .first<{ request_count: number }>();
    expect(row?.request_count).toBe(2);
  });
});
