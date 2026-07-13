import {
  configureCloudflareDomain,
  listCloudflareZones,
  verifyCloudflareToken
} from "@worker/features/setup/cloudflare";
import { afterEach, describe, expect, it, vi } from "vitest";

const API_BASE = "https://api.cloudflare.com/client/v4";

describe("Cloudflare setup API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists zones from a Cloudflare API token", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          result: [
            zone({ id: "zone-b", name: "zeta.com" }),
            zone({ id: "zone-a", name: "alpha.com" })
          ],
          result_info: { page: 1, total_pages: 1 }
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCloudflareZones({ apiToken: "token-123" })).resolves.toEqual([
      {
        accountName: "HQBase",
        accountId: "account-1",
        id: "zone-a",
        name: "alpha.com",
        status: "active",
        type: "full"
      },
      {
        accountName: "HQBase",
        accountId: "account-1",
        id: "zone-b",
        name: "zeta.com",
        status: "active",
        type: "full"
      }
    ]);

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe(`${API_BASE}/zones?page=1&per_page=100`);
    expect(firstCall?.[1]?.headers).toMatchObject({ authorization: "Bearer token-123" });
  });

  it("verifies a Cloudflare API token", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ result: { id: "token-1", status: "active" } }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCloudflareToken({ apiToken: "token-123" })).resolves.toEqual({
      active: true,
      id: "token-1",
      status: "active"
    });
  });

  it("surfaces Cloudflare API errors before validating result shape", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          {
            errors: [{ code: 10000, message: "Authentication error" }],
            result: null,
            success: false
          },
          403
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCloudflareToken({ apiToken: "token-123" })).rejects.toThrow(
      "Authentication error"
    );
  });

  it("explains invalid Cloudflare API token responses", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          {
            errors: [{ code: 10000, message: "Invalid API Token" }],
            result: null,
            success: false
          },
          403
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCloudflareToken({ apiToken: "token-123" })).rejects.toThrow(
      "Cloudflare rejected this API token. Click Create Token, then paste the token value shown once after creation."
    );
  });

  it("accepts account-owned tokens that cannot use the user token verifier", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = fetchInputUrl(input);
      if (url.endsWith("/user/tokens/verify")) {
        return Promise.resolve(
          jsonResponse(
            {
              errors: [{ code: 1000, message: "Invalid API Token" }],
              result: null,
              success: false
            },
            403
          )
        );
      }

      return Promise.resolve(
        jsonResponse({
          result: [zone({ id: "zone-a", name: "alpha.com" })],
          result_info: { page: 1, total_pages: 1 }
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCloudflareToken({ apiToken: "token-123" })).resolves.toEqual({
      active: true,
      id: "account-owned-token",
      status: "active"
    });

    expect(fetchMock.mock.calls.map(([input]) => fetchInputUrl(input))).toEqual([
      `${API_BASE}/user/tokens/verify`,
      `${API_BASE}/zones?per_page=1`
    ]);
  });

  it("reports unexpected successful Cloudflare result shapes clearly", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ result: null, success: true }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCloudflareToken({ apiToken: "token-123" })).rejects.toThrow(
      "Cloudflare API returned an unexpected response for /user/tokens/verify."
    );
  });

  it("enables routing, points catch-all at the Worker, and verifies readiness", async () => {
    let sendingEnabled = false;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = fetchInputUrl(input);
      const method = init?.method ?? "GET";
      if (url === `${API_BASE}/zones/zone-1/email/sending/subdomains`) {
        if (method === "POST") {
          sendingEnabled = true;
          return Promise.resolve(jsonResponse({ result: {} }));
        }
        return Promise.resolve(
          jsonResponse({
            result: sendingEnabled ? [{ enabled: true, name: "example.com" }] : []
          })
        );
      }

      return Promise.resolve(cloudflareSetupResponse(url, method));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await configureCloudflareDomain({
      apiToken: "token-123",
      enableSending: true,
      workerName: "hqbase",
      zoneId: "zone-1"
    });

    const catchAllCall = fetchMock.mock.calls.find(
      ([url]) => url === `${API_BASE}/zones/zone-1/email/routing/rules/catch_all`
    );
    expect(result.status.ready).toBe(true);
    expect(result.steps.map((step) => step.status)).toEqual([
      "skipped",
      "success",
      "success",
      "success"
    ]);
    expect(catchAllCall?.[1]?.body).toBe(
      JSON.stringify({
        actions: [{ type: "worker", value: ["hqbase"] }],
        enabled: true,
        matchers: [{ type: "all" }],
        name: "HQBase catch-all"
      })
    );
    expect(catchAllCall?.[1]?.method).toBe("PUT");
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          fetchInputUrl(input) === `${API_BASE}/zones/zone-1/email/sending/subdomains` &&
          init?.method === "POST"
      )
    ).toBe(true);
  });

  it("treats already-enabled Email Sending as an idempotent success", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) =>
      Promise.resolve(cloudflareSetupResponse(fetchInputUrl(input), init?.method ?? "GET"))
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await configureCloudflareDomain({
      apiToken: "token-123",
      enableSending: true,
      workerName: "hqbase",
      zoneId: "zone-1"
    });

    expect(result.steps.find((step) => step.id === "sending")).toMatchObject({
      message: "Email Sending is already enabled for this domain.",
      status: "success"
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          fetchInputUrl(input) === `${API_BASE}/zones/zone-1/email/sending/subdomains` &&
          init?.method === "POST"
      )
    ).toBe(false);
  });

  it("accepts the current Email Routing DNS record response", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = fetchInputUrl(input);
      const method = init?.method ?? "GET";
      if (url === `${API_BASE}/zones/zone-1/email/routing/dns` && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            result: [
              {
                content: "route1.mx.cloudflare.net.",
                name: "example.com",
                priority: 50,
                ttl: 1,
                type: "MX"
              },
              {
                content: '"v=spf1 include:_spf.mx.cloudflare.net ~all"',
                name: "example.com",
                ttl: 1,
                type: "TXT"
              }
            ]
          })
        );
      }

      return Promise.resolve(cloudflareSetupResponse(url, method));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await configureCloudflareDomain({
      apiToken: "token-123",
      enableSending: true,
      workerName: "hqbase",
      zoneId: "zone-1"
    });

    expect(result.status.routing).toMatchObject({
      dnsReady: true,
      missingRecords: 0
    });
    expect(result.status.ready).toBe(true);
  });

  it("explains missing Zone Settings permission for Email Routing DNS", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = fetchInputUrl(input);
      const method = init?.method ?? "GET";
      if (
        url === `${API_BASE}/zones/zone-1/email/routing` ||
        url === `${API_BASE}/zones/zone-1/email/routing/dns`
      ) {
        return Promise.resolve(
          jsonResponse(
            {
              errors: [{ code: 10000, message: "Authentication error" }],
              result: null,
              success: false
            },
            403
          )
        );
      }

      return Promise.resolve(cloudflareSetupResponse(url, method));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await configureCloudflareDomain({
      apiToken: "token-123",
      enableSending: true,
      workerName: "hqbase",
      zoneId: "zone-1"
    });

    const routingStep = result.steps.find((step) => step.id === "routing");
    expect(routingStep).toMatchObject({
      message:
        "Cloudflare rejected the Email Routing DNS/settings request. Add Zone Settings Edit to the setup token, then retry the domain connection.",
      status: "failed"
    });
    expect(result.status.routing.error).toBe(
      "Cloudflare rejected the Email Routing DNS/settings request. Add Zone Settings Edit to the setup token, then retry the domain connection."
    );
  });

  it("can attach a Worker custom domain during setup", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) =>
      Promise.resolve(cloudflareSetupResponse(fetchInputUrl(input), init?.method ?? "GET"))
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await configureCloudflareDomain({
      apiToken: "token-123",
      appHostname: "hqbase.example.com",
      attachCustomDomain: true,
      enableSending: true,
      workerName: "hqbase",
      zoneId: "zone-1"
    });

    const attachCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === `${API_BASE}/accounts/account-1/workers/domains` && init?.method === "PUT"
    );
    expect(result.steps[0]?.status).toBe("success");
    expect(attachCall?.[1]?.body).toBe(
      JSON.stringify({
        hostname: "hqbase.example.com",
        service: "hqbase",
        zone_id: "zone-1",
        zone_name: "example.com"
      })
    );
  });

  it("adopts an existing custom domain already attached to this Worker", async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = fetchInputUrl(input);
      const method = init?.method ?? "GET";
      if (url === `${API_BASE}/accounts/account-1/workers/domains` && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            result: [
              {
                hostname: "hqbase.example.com",
                id: "domain-1",
                service: "hqbase",
                zone_id: "zone-1",
                zone_name: "example.com"
              }
            ]
          })
        );
      }
      return Promise.resolve(cloudflareSetupResponse(url, method));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await configureCloudflareDomain({
      apiToken: "token-123",
      appHostname: "hqbase.example.com",
      attachCustomDomain: true,
      enableSending: true,
      workerName: "hqbase",
      zoneId: "zone-1"
    });

    expect(result.steps[0]).toMatchObject({
      message: "hqbase.example.com already routes to Worker hqbase.",
      status: "success"
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          fetchInputUrl(input) === `${API_BASE}/accounts/account-1/workers/domains` &&
          init?.method === "PUT"
      )
    ).toBe(false);
  });
});

function cloudflareSetupResponse(url: string, method: string) {
  if (url === `${API_BASE}/zones/zone-1`) {
    return jsonResponse({ result: zone({ id: "zone-1", name: "example.com" }) });
  }
  if (url === `${API_BASE}/accounts/account-1/workers/domains` && method === "PUT") {
    return jsonResponse({
      result: {
        hostname: "hqbase.example.com",
        id: "domain-1",
        service: "hqbase",
        zone_id: "zone-1",
        zone_name: "example.com"
      }
    });
  }
  if (url === `${API_BASE}/accounts/account-1/workers/domains`) {
    return jsonResponse({ result: [] });
  }
  if (url === `${API_BASE}/zones/zone-1/email/routing/dns` && method === "POST") {
    return jsonResponse({ result: {} });
  }
  if (url === `${API_BASE}/zones/zone-1/email/routing/rules/catch_all` && method === "PUT") {
    return jsonResponse({ result: {} });
  }
  if (url === `${API_BASE}/zones/zone-1/email/sending/subdomains` && method === "POST") {
    return jsonResponse({ result: {} });
  }
  if (url === `${API_BASE}/zones/zone-1/email/routing`) {
    return jsonResponse({ result: { enabled: true, status: "ready" } });
  }
  if (url === `${API_BASE}/zones/zone-1/email/routing/dns`) {
    return jsonResponse({ result: { errors: [] } });
  }
  if (url === `${API_BASE}/zones/zone-1/email/routing/rules/catch_all`) {
    return jsonResponse({
      result: {
        actions: [{ type: "worker", value: ["hqbase"] }],
        enabled: true
      }
    });
  }
  if (url === `${API_BASE}/zones/zone-1/email/sending/subdomains`) {
    return jsonResponse({ result: [{ enabled: true, name: "example.com" }] });
  }

  return jsonResponse({ result: {} });
}

function fetchInputUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function zone({ id, name }: { id: string; name: string }) {
  return {
    account: { id: "account-1", name: "HQBase" },
    id,
    name,
    status: "active",
    type: "full"
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(
    JSON.stringify({
      errors: [],
      messages: [],
      success: true,
      ...body
    }),
    {
      headers: { "content-type": "application/json" },
      status
    }
  );
}
