import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Community setup OAuth routes", () => {
  it("starts the fixed Community PKCE flow without exposing credentials", async () => {
    const response = await SELF.fetch(
      "https://community.user.workers.dev/api/setup/cloudflare/oauth/start",
      {
        method: "POST",
        redirect: "manual"
      }
    );
    const target = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(target.origin).toBe("https://auth.hqbase.io");
    expect(target.pathname).toBe("/community/oauth/authorize");
    expect(target.searchParams.get("callback")).toBe(
      "https://community.user.workers.dev/api/setup/cloudflare/oauth/callback"
    );
    expect(target.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.toString()).not.toContain("verifier");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
  });

  it("rejects a callback without matching state before token exchange", async () => {
    const response = await SELF.fetch(
      "https://community.user.workers.dev/api/setup/cloudflare/oauth/callback?code=code-1&state=wrong",
      { redirect: "manual" }
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://community.user.workers.dev/?cloudflare=invalid"
    );
  });
});
