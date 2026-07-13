import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Worker health", () => {
  it("serves the API health endpoint inside workerd", async () => {
    const response = await SELF.fetch("https://hqbase.test/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "hqbase"
    });
  });
});
