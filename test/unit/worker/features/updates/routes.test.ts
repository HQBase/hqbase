import type { WorkerEnv } from "@worker/lib/env";
import { AppError } from "@worker/lib/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  operationalLog: vi.fn(),
  requireAuthContext: vi.fn(),
  requireRecentSession: vi.fn(),
  requireRole: vi.fn(),
  resolveRuntimeCloudflareGrant: vi.fn(),
  revokeRuntimeCloudflareGrant: vi.fn(),
  triggerUpdate: vi.fn()
}));

vi.mock("@worker/auth/session", () => ({
  isRecentSession: vi.fn(),
  requireAuthContext: mocks.requireAuthContext,
  requireRecentSession: mocks.requireRecentSession,
  requireRole: mocks.requireRole
}));
vi.mock("@worker/features/cloudflare/oauth", () => ({
  clearRuntimeCloudflareGrantCookie: () => "hqbase_cf_grant=; Max-Age=0; Path=/",
  finishRuntimeCloudflareOAuth: vi.fn(),
  recentAuthenticationRedirect: vi.fn(),
  resolveRuntimeCloudflareGrant: mocks.resolveRuntimeCloudflareGrant,
  revokeRuntimeCloudflareGrant: mocks.revokeRuntimeCloudflareGrant,
  startRuntimeCloudflareOAuth: vi.fn()
}));
vi.mock("@worker/features/updates/service", () => ({
  getUpdateStatus: vi.fn(),
  triggerUpdate: mocks.triggerUpdate
}));
vi.mock("@worker/observability/log", () => ({ operationalLog: mocks.operationalLog }));

import { updateRoutes } from "@worker/features/updates/routes";

describe("update routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue({
      session: { createdAt: new Date(), id: "session-1", userId: "user-1" },
      user: { email: "owner@example.com", id: "user-1", name: "Owner", role: "owner" }
    });
    mocks.resolveRuntimeCloudflareGrant.mockResolvedValue("temporary-grant");
    mocks.revokeRuntimeCloudflareGrant.mockResolvedValue(undefined);
    mocks.triggerUpdate.mockResolvedValue({ buildId: "build-1", status: "queued" });
  });

  it("returns the build result and clears the cookie when grant revocation fails", async () => {
    mocks.revokeRuntimeCloudflareGrant.mockRejectedValue(
      new AppError("CLOUDFLARE_OAUTH_REVOKE_FAILED", "Grant revocation failed.", 502)
    );

    const response = await applyUpdate();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ buildId: "build-1", status: "queued" });
    expect(response.headers.get("set-cookie")).toContain("hqbase_cf_grant=");
    expect(mocks.operationalLog).toHaveBeenCalledWith(
      "warn",
      "cloudflare_grant_revocation_failed",
      { errorCode: "CLOUDFLARE_OAUTH_REVOKE_FAILED" }
    );
  });

  it("preserves the build error and clears the cookie when cleanup also fails", async () => {
    mocks.triggerUpdate.mockRejectedValue(
      new AppError("UPDATE_TRIGGER_NOT_FOUND", "Production trigger not found.", 409)
    );
    mocks.revokeRuntimeCloudflareGrant.mockRejectedValue(
      new AppError("CLOUDFLARE_OAUTH_REVOKE_FAILED", "Grant revocation failed.", 502)
    );

    const response = await applyUpdate();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UPDATE_TRIGGER_NOT_FOUND", message: "Production trigger not found." }
    });
    expect(response.headers.get("set-cookie")).toContain("hqbase_cf_grant=");
  });
});

function applyUpdate(): Promise<Response> {
  return Promise.resolve(
    updateRoutes.request(
      "/apply",
      {
        body: JSON.stringify({ expectedVersion: "1.2.0" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      },
      {} as WorkerEnv
    )
  );
}
