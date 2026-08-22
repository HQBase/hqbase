import { afterEach, describe, expect, it, vi } from "vitest";
import { listPersonalAccessTokens } from "@/features/personal-access-tokens/api";

const validToken = {
  id: "pat_list",
  userId: "usr_list",
  ownerName: "List User",
  name: "List client",
  tokenSuffix: "Ab_9",
  createdAt: "2026-08-20T12:00:00.000Z",
  expiresAt: null
};

afterEach(() => vi.unstubAllGlobals());

describe("personal access token list response", () => {
  it("returns validated metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ personalAccessTokens: [validToken] }))
    );
    await expect(listPersonalAccessTokens()).resolves.toEqual({
      personalAccessTokens: [validToken]
    });
  });

  it.each([
    {},
    { personalAccessTokens: null },
    { personalAccessTokens: {} },
    { personalAccessTokens: [{ ...validToken, id: 1 }] }
  ])("rejects malformed successful metadata", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(listPersonalAccessTokens()).rejects.toThrow(
      "Personal access tokens could not be loaded."
    );
  });

  it("rejects an unreadable successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error("synthetic unreadable body"))
      })
    );
    await expect(listPersonalAccessTokens()).rejects.toThrow(
      "Personal access tokens could not be loaded."
    );
  });
});

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}
