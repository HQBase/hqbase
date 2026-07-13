import { afterEach, describe, expect, it, vi } from "vitest";
import { revokeSetupGrant } from "../../../../../worker/features/setup/oauth-cleanup";
import type { WorkerEnv } from "../../../../../worker/lib/env";

afterEach(() => vi.unstubAllGlobals());

describe("setup OAuth cleanup", () => {
  it("deletes the masked setup secret before revoking the grant", async () => {
    const requests: Array<{ input: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ input: String(input), init });
        return new Response(null, { status: 200 });
      })
    );

    await revokeSetupGrant(
      {
        CLOUDFLARE_OAUTH_CLIENT_ID: "client",
        HQBASE_SETUP_OAUTH_ACCESS_TOKEN: "access-token",
        HQBASE_WORKER_NAME: "hqbase-pro"
      } as WorkerEnv,
      "account"
    );

    expect(requests.map((request) => request.input)).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/account/workers/scripts/hqbase-pro/secrets/HQBASE_SETUP_OAUTH_ACCESS_TOKEN",
      "https://dash.cloudflare.com/oauth2/revoke"
    ]);
    expect(String(requests[1]?.init?.body)).toContain("token=access-token");
  });
});
