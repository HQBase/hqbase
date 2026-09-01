import { cloudflare, isAmbiguousCloudflareOperation } from "@worker/features/updates/cloudflare";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  operationalLog: vi.fn()
}));

vi.mock("@worker/observability/log", () => ({ operationalLog: mocks.operationalLog }));

beforeEach(() => {
  mocks.operationalLog.mockReset();
});

describe("Cloudflare update requests", () => {
  it("reports safe provider diagnostics without provider content", async () => {
    const error = await rejectedCloudflareCall(
      responseFetcher(
        {
          success: false,
          errors: [
            {
              code: 1000,
              message: "Invalid request body with customer-secret",
              source: { pointer: "customer-secret" }
            }
          ]
        },
        { status: 400, headers: { "cf-ray": "ray-123" } }
      ),
      "set_build_command"
    );

    expect(error).toMatchObject({
      code: "UPDATE_CLOUDFLARE_ERROR",
      message:
        "Cloudflare rejected the request to set the Workers Builds deploy command (HTTP 400, code 1000, request ray-123).",
      status: 502
    });
    expect(String(error)).not.toContain("Invalid request body");
    expect(String(error)).not.toContain("customer-secret");
    expect(isAmbiguousCloudflareOperation(error, "set_build_command")).toBe(false);
    expect(mocks.operationalLog).toHaveBeenCalledOnce();
    expect(mocks.operationalLog).toHaveBeenCalledWith("warn", "cloudflare_update_request_failed", {
      operation: "set_build_command",
      providerCode: "1000",
      requestId: "ray-123",
      status: 400
    });
    expect(Object.keys(mocks.operationalLog.mock.calls[0]?.[2] ?? {}).sort()).toEqual([
      "operation",
      "providerCode",
      "requestId",
      "status"
    ]);
  });

  it("bounds and redacts a non-JSON provider response", async () => {
    const providerBody = `customer-secret:${"x".repeat(20_000)}`;
    const error = await rejectedCloudflareCall(
      async () =>
        new Response(providerBody, {
          status: 502,
          headers: { "cf-ray": "unsafe request id" }
        }),
      "start_build"
    );

    expect(error).toMatchObject({
      code: "UPDATE_CLOUDFLARE_INVALID_RESPONSE",
      message: "Cloudflare rejected the request to start the Workers Build (HTTP 502).",
      status: 502
    });
    expect((error as Error).message.length).toBeLessThan(200);
    expect(String(error)).not.toContain("customer-secret");
    expect(isAmbiguousCloudflareOperation(error, "start_build")).toBe(true);
    expect(mocks.operationalLog).toHaveBeenCalledWith("warn", "cloudflare_update_request_failed", {
      operation: "start_build",
      providerCode: null,
      requestId: null,
      status: 502
    });
  });

  it("separates network failures from timeouts", async () => {
    const networkError = await rejectedCloudflareCall(async () => {
      throw new Error("customer-secret network detail");
    }, "start_build");
    const signal = AbortSignal.abort();
    const timeoutError = await rejectedCloudflareCall(
      async () => {
        throw new Error("customer-secret timeout detail");
      },
      "start_build",
      signal
    );

    expect(networkError).toMatchObject({
      code: "UPDATE_CLOUDFLARE_UNAVAILABLE",
      status: 502
    });
    expect(timeoutError).toMatchObject({
      code: "UPDATE_CLOUDFLARE_TIMEOUT",
      status: 504
    });
    expect(String(networkError)).not.toContain("customer-secret");
    expect(String(timeoutError)).not.toContain("customer-secret");
    expect(isAmbiguousCloudflareOperation(networkError, "start_build")).toBe(true);
    expect(isAmbiguousCloudflareOperation(timeoutError, "start_build")).toBe(true);
  });

  it("limits ambiguous provider failures to the matching operation", async () => {
    const startBuildError = await rejectedCloudflareCall(
      responseFetcher({ success: false, errors: [{ code: "internal_error" }] }, { status: 503 }),
      "start_build"
    );

    expect(isAmbiguousCloudflareOperation(startBuildError, "start_build")).toBe(true);
    expect(isAmbiguousCloudflareOperation(startBuildError, "set_build_command")).toBe(false);
  });
});

async function rejectedCloudflareCall(
  fetcher: typeof fetch,
  operation: Parameters<typeof cloudflare>[3],
  signal?: AbortSignal
): Promise<unknown> {
  try {
    await cloudflare(
      "https://api.cloudflare.com/client/v4/test",
      signal ? { signal } : {},
      fetcher,
      operation
    );
  } catch (error) {
    return error;
  }
  throw new Error("Expected the Cloudflare request to fail.");
}

function responseFetcher(body: unknown, init: ResponseInit): typeof fetch {
  return (async () => Response.json(body, init)) as typeof fetch;
}
