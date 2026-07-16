import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, apiPost } from "../../../app/lib/api-client";

describe("API client errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves server error codes for safe recovery actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "RECENT_AUTH_REQUIRED",
              message: "Sign in again before changing workspace infrastructure."
            }
          }),
          { status: 403 }
        )
      )
    );

    await expect(apiPost("/api/upgrades/pro/advance")).rejects.toEqual(
      new ApiRequestError(
        "RECENT_AUTH_REQUIRED",
        "Sign in again before changing workspace infrastructure."
      )
    );
  });
});
