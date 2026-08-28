import { describe, expect, it, vi } from "vitest";

import { authenticationHeaders, emptyR2Bucket } from "../../../scripts/hqbase/empty-r2.mjs";

const accountId = "a".repeat(32);
const bucket = "hqbase-mail";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

describe("R2 bucket emptying", () => {
  it("deletes each listed object and confirms that the bucket is empty", async () => {
    let listCount = 0;
    const fetchRequest = vi.fn(async (_url, init = {}) => {
      if (init.method === "DELETE") {
        return jsonResponse({ result: {}, success: true });
      }
      listCount += 1;
      return jsonResponse({
        result:
          listCount === 1 ? [{ key: "sent/message body.html" }, { key: "raw/special+%.eml" }] : [],
        success: true
      });
    });

    await expect(
      emptyR2Bucket(
        { accountId, bucket },
        {
          authentication: { token: "test-token", type: "api_token" },
          fetchRequest
        }
      )
    ).resolves.toBe(2);

    expect(fetchRequest).toHaveBeenCalledTimes(4);
    expect(fetchRequest.mock.calls.map(([url]) => url)).toEqual([
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects?per_page=1000`,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/sent/message%20body.html`,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/raw/special%2B%25.eml`,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects?per_page=1000`
    ]);
    for (const [, init] of fetchRequest.mock.calls) {
      expect(init.headers).toEqual({ Authorization: "Bearer test-token" });
    }
  });

  it("supports Wrangler API key credentials without putting them in a URL", () => {
    expect(
      authenticationHeaders({ email: "owner@example.com", key: "key", type: "api_key" })
    ).toEqual({ "X-Auth-Email": "owner@example.com", "X-Auth-Key": "key" });
  });

  it("fails closed on an invalid response without exposing an object key", async () => {
    const failure = emptyR2Bucket(
      { accountId, bucket },
      {
        authentication: { token: "test-token", type: "oauth" },
        fetchRequest: async () => jsonResponse({ errors: [{ code: 10000 }], success: false }, 403)
      }
    );

    await expect(failure).rejects.toThrow(
      "Could not list objects in the recorded R2 bucket (HTTP 403, Cloudflare code 10000)."
    );
  });

  it("redacts object keys from network failures", async () => {
    let requestCount = 0;
    const failure = emptyR2Bucket(
      { accountId, bucket },
      {
        authentication: { token: "test-token", type: "oauth" },
        fetchRequest: async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return jsonResponse({ result: [{ key: "private/customer-file.txt" }], success: true });
          }
          throw new Error("private/customer-file.txt failed");
        }
      }
    );

    await expect(failure).rejects.toThrow("Could not delete an object in the recorded R2 bucket.");
    await expect(failure).rejects.not.toThrow("customer-file.txt");
  });
});
