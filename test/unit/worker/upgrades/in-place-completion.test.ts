import { describe, expect, it } from "vitest";
import { completionUpgradeSql } from "../../../../worker/features/upgrades/in-place";
import {
  deleteDisposableWorkers,
  verifyPromotedService
} from "../../../../worker/features/upgrades/in-place-cloudflare";

describe("in-place upgrade completion", () => {
  it("clears durable continuation ciphertext when the Community schema supports it", () => {
    expect(completionUpgradeSql(true)).toContain("continuation_ciphertext = NULL");
  });

  it("remains compatible with Community schema 4", () => {
    expect(completionUpgradeSql(false)).not.toContain("continuation_ciphertext");
  });

  it("verifies the retained Community version from Cloudflare's paginated result", async () => {
    const upgrade = {
      account_id: "account-1",
      worker_name: "hqbase-community",
      active_version_id: "community-version",
      candidate_version_id: "pro-version",
      d1_database_id: "database-1",
      r2_bucket_name: "mail-objects",
      inventory_json: JSON.stringify({
        secretNames: ["BETTER_AUTH_SECRET"],
        customDomains: ["mail.example.com"],
        routes: [{ pattern: "example.com/mail/*" }]
      }),
      created_resources_json: JSON.stringify({ resources: [] })
    };
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      let result: unknown;
      if (url.endsWith("/deployments")) {
        result = { deployments: [{ versions: [{ version_id: "pro-version", percentage: 100 }] }] };
      } else if (url.endsWith("/settings")) {
        result = {
          bindings: [
            { name: "DB", type: "d1", database_id: "database-1" },
            { name: "MAIL_OBJECTS", type: "r2_bucket", bucket_name: "mail-objects" },
            { name: "BETTER_AUTH_SECRET", type: "secret_text" }
          ]
        };
      } else if (url.endsWith("/secrets")) {
        result = [{ name: "BETTER_AUTH_SECRET" }];
      } else if (url.endsWith("/workers/domains")) {
        result = [{ hostname: "mail.example.com", service: "hqbase-community" }];
      } else if (url.endsWith("/versions")) {
        result = { items: [{ id: "pro-version" }, { id: "community-version" }] };
      } else if (url.includes("/zones?")) {
        result = [{ id: "zone-1" }];
      } else if (url.endsWith("/zones/zone-1/workers/routes")) {
        result = [{ pattern: "example.com/mail/*", script: "hqbase-community" }];
      } else {
        throw new Error(`Unexpected request: ${url}`);
      }
      return Response.json({ success: true, result });
    };
    await expect(
      verifyPromotedService(upgrade, "temporary-token", fetcher)
    ).resolves.toBeUndefined();
  });

  it("deletes only created disposable validator Workers", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    await deleteDisposableWorkers(
      {
        account_id: "account-1",
        worker_name: "hqbase-community",
        active_version_id: "community-version",
        candidate_version_id: "pro-version",
        d1_database_id: "database-1",
        r2_bucket_name: "mail-objects",
        inventory_json: "{}",
        created_resources_json: JSON.stringify({
          resources: [
            {
              type: "worker",
              name: "hqbase-upgrade-validator-123",
              ownership: "created",
              disposition: "disposable"
            },
            {
              type: "worker",
              name: "shared-worker",
              ownership: "reused",
              disposition: "persistent"
            },
            {
              type: "r2",
              name: "mail-objects",
              ownership: "reused",
              disposition: "persistent"
            }
          ]
        })
      },
      "temporary-token",
      async (input, init) => {
        requests.push({ url: String(input), init });
        return Response.json({ success: true });
      }
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("/workers/scripts/hqbase-upgrade-validator-123");
    expect(requests[0]?.init?.method).toBe("DELETE");
  });

  it("accepts an already-removed validator", async () => {
    await expect(
      deleteDisposableWorkers(
        {
          account_id: "account-1",
          worker_name: "hqbase-community",
          active_version_id: "community-version",
          candidate_version_id: "pro-version",
          d1_database_id: "database-1",
          r2_bucket_name: "mail-objects",
          inventory_json: "{}",
          created_resources_json: JSON.stringify({
            resources: [
              {
                type: "worker",
                name: "hqbase-upgrade-validator-123",
                ownership: "created",
                disposition: "disposable"
              }
            ]
          })
        },
        "temporary-token",
        async () => new Response("missing", { status: 404 })
      )
    ).resolves.toBeUndefined();
  });
});
