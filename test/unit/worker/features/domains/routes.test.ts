import type { WorkerEnv } from "@worker/lib/env";
import { AppError } from "@worker/lib/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnectCloudflareDomain: vi.fn(),
  disconnectMailDomain: vi.fn(),
  findMailDomainById: vi.fn(),
  findMailDomainByName: vi.fn(),
  inspectCloudflareDomain: vi.fn(),
  operationalLog: vi.fn(),
  recordAudit: vi.fn(),
  requireAuthContext: vi.fn(),
  requireRecentSession: vi.fn(),
  requireRole: vi.fn(),
  resolveRuntimeCloudflareGrant: vi.fn(),
  revokeRuntimeCloudflareGrant: vi.fn(),
  updateMailDomainReadiness: vi.fn(),
  upsertMailDomain: vi.fn()
}));

vi.mock("@worker/auth/session", () => ({
  isRecentSession: vi.fn(),
  requireAuthContext: mocks.requireAuthContext,
  requireRecentSession: mocks.requireRecentSession,
  requireRole: mocks.requireRole
}));
vi.mock("@worker/features/audit/service", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@worker/features/cloudflare/oauth", () => ({
  clearRuntimeCloudflareGrantCookie: () => "hqbase_cf_grant=; Max-Age=0; Path=/",
  finishRuntimeCloudflareOAuth: vi.fn(),
  recentAuthenticationRedirect: vi.fn(),
  resolveRuntimeCloudflareGrant: mocks.resolveRuntimeCloudflareGrant,
  revokeRuntimeCloudflareGrant: mocks.revokeRuntimeCloudflareGrant,
  startRuntimeCloudflareOAuth: vi.fn()
}));
vi.mock("@worker/features/setup/cloudflare", () => ({
  attachWorkerCustomDomain: vi.fn(),
  configureCloudflareDomain: vi.fn(),
  disconnectCloudflareDomain: mocks.disconnectCloudflareDomain,
  inspectCloudflareDomain: mocks.inspectCloudflareDomain,
  listCloudflareZones: vi.fn()
}));
vi.mock("@worker/features/domains/lifecycle-service", () => ({
  disconnectMailDomain: mocks.disconnectMailDomain,
  forgetMailDomain: vi.fn()
}));
vi.mock("@worker/features/domains/queries", () => ({
  findMailDomainById: mocks.findMailDomainById,
  findMailDomainByName: mocks.findMailDomainByName,
  listMailDomains: vi.fn(),
  updateMailDomainReadiness: mocks.updateMailDomainReadiness,
  updateMailDomainSettings: vi.fn(),
  upsertMailDomain: mocks.upsertMailDomain
}));
vi.mock("@worker/observability/log", () => ({ operationalLog: mocks.operationalLog }));

import { domainRoutes } from "@worker/features/domains/routes";

const currentDomain = {
  accountId: "account-1",
  catchAllMailboxId: null,
  catchAllPolicy: "unassigned",
  createdAt: "2026-08-27T00:00:00.000Z",
  dnsStatus: "ready",
  id: "domain-1",
  isEnabled: false,
  lastErrorCode: null,
  disconnectedAt: null,
  name: "example.com",
  receivingStatus: "ready",
  sendingStatus: "ready",
  updatedAt: "2026-08-27T00:00:00.000Z",
  verifiedAt: "2026-08-27T00:00:00.000Z",
  zoneId: "zone-1"
} as const;

describe("domain readiness routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue({
      session: { createdAt: new Date(), id: "session-1", userId: "user-1" },
      user: { email: "owner@example.com", id: "user-1", name: "Owner", role: "owner" }
    });
    mocks.findMailDomainById.mockResolvedValue(currentDomain);
    mocks.findMailDomainByName.mockResolvedValue(null);
    mocks.resolveRuntimeCloudflareGrant.mockResolvedValue("temporary-grant");
    mocks.revokeRuntimeCloudflareGrant.mockResolvedValue(undefined);
    mocks.disconnectCloudflareDomain.mockResolvedValue({ catchAllChanged: true });
    mocks.disconnectMailDomain.mockResolvedValue({
      ...currentDomain,
      catchAllPolicy: "reject",
      disconnectedAt: "2026-08-27T02:00:00.000Z",
      receivingStatus: "disabled",
      sendingStatus: "disabled"
    });
    mocks.inspectCloudflareDomain.mockResolvedValue({
      catchAll: {
        configuredForWorker: false,
        enabled: true,
        error: null,
        workerNames: ["other-worker"]
      },
      ready: false,
      routing: {
        dnsReady: true,
        enabled: true,
        error: null,
        missingRecords: 0,
        status: "ready"
      },
      sending: { enabled: true, error: null, subdomains: ["example.com"] },
      workerName: "hqbase",
      zone: {
        accountId: "account-1",
        accountName: "HQBase",
        id: "zone-1",
        name: "example.com",
        status: "active",
        type: "full"
      }
    });
    mocks.updateMailDomainReadiness.mockResolvedValue({
      ...currentDomain,
      receivingStatus: "degraded",
      verifiedAt: "2026-08-27T01:00:00.000Z"
    });
  });

  it("rechecks without reconfiguring Cloudflare or changing domain policy state", async () => {
    const response = await recheckDomain();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("hqbase_cf_grant=");
    expect(mocks.inspectCloudflareDomain).toHaveBeenCalledWith({
      apiToken: "temporary-grant",
      workerName: "hqbase",
      zoneId: "zone-1"
    });
    expect(mocks.updateMailDomainReadiness).toHaveBeenCalledWith({} as D1Database, "domain-1", {
      accountId: "account-1",
      dnsStatus: "ready",
      receivingStatus: "degraded",
      sendingStatus: "ready",
      zoneId: "zone-1"
    });
    expect(mocks.revokeRuntimeCloudflareGrant).toHaveBeenCalledWith(
      "temporary-grant",
      expect.any(Object)
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      {} as D1Database,
      expect.objectContaining({ action: "domain.recheck", outcome: "success" })
    );
  });

  it("returns the refreshed state if grant cleanup fails", async () => {
    mocks.revokeRuntimeCloudflareGrant.mockRejectedValue(
      new AppError("CLOUDFLARE_OAUTH_REVOKE_FAILED", "Grant revocation failed.", 502)
    );

    const response = await recheckDomain();

    expect(response.status).toBe(200);
    expect(mocks.operationalLog).toHaveBeenCalledWith(
      "warn",
      "cloudflare_grant_revocation_failed",
      { errorCode: "CLOUDFLARE_OAUTH_REVOKE_FAILED" }
    );
  });

  it("disconnects the Cloudflare route before saving local domain state", async () => {
    const response = await disconnectDomain();

    expect(response.status).toBe(200);
    expect(mocks.disconnectCloudflareDomain).toHaveBeenCalledWith({
      apiToken: "temporary-grant",
      domainName: "example.com",
      workerName: "hqbase",
      zoneId: "zone-1"
    });
    expect(mocks.disconnectMailDomain).toHaveBeenCalledWith(
      {} as D1Database,
      "domain-1",
      expect.objectContaining({
        action: "domain.disconnect",
        metadata: { catchAllChanged: true },
        outcome: "success"
      })
    );
    expect(await response.json()).toMatchObject({
      disconnectedAt: "2026-08-27T02:00:00.000Z",
      receivingStatus: "disabled",
      sendingStatus: "disabled"
    });
  });

  it("records a failed disconnect without changing local domain state", async () => {
    mocks.disconnectCloudflareDomain.mockRejectedValue(
      new AppError("CLOUDFLARE_API_ERROR", "Cloudflare request failed.", 502)
    );

    const response = await disconnectDomain();

    expect(response.status).toBe(500);
    expect(mocks.disconnectMailDomain).not.toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      {} as D1Database,
      expect.objectContaining({
        action: "domain.disconnect",
        metadata: { errorCode: "CLOUDFLARE_API_ERROR" },
        outcome: "failure"
      })
    );
  });

  it("does not let the legacy create route reconnect a disconnected domain", async () => {
    mocks.findMailDomainByName.mockResolvedValue({
      ...currentDomain,
      disconnectedAt: "2026-08-27T02:00:00.000Z"
    });

    const response = await domainRoutes.request(
      "/",
      {
        body: JSON.stringify({ name: "example.com" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      },
      { DB: {} as D1Database } as WorkerEnv
    );

    expect(response.status).toBe(500);
    expect(mocks.upsertMailDomain).not.toHaveBeenCalled();
  });
});

function recheckDomain(): Promise<Response> {
  return Promise.resolve(
    domainRoutes.request("/domain-1/recheck", { method: "POST" }, {
      DB: {} as D1Database,
      HQBASE_WORKER_NAME: "hqbase"
    } as WorkerEnv)
  );
}

function disconnectDomain(): Promise<Response> {
  return Promise.resolve(
    domainRoutes.request("/domain-1/disconnect", { method: "POST" }, {
      DB: {} as D1Database,
      HQBASE_WORKER_NAME: "hqbase"
    } as WorkerEnv)
  );
}
