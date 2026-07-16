import { compareVersions, getUpdateStatus, triggerUpdate } from "@worker/features/updates/service";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it, vi } from "vitest";

const publicKey = "MCowBQYDK2VwAyEAsVwKniCvpHDwbbnjTPP0SuIIG97cRL+iFBQvay9OrU4=";
const envelope = {
  payload:
    "eyJmb3JtYXQiOiJocWJhc2UtcmVsZWFzZS12MSIsImVkaXRpb24iOiJjb21tdW5pdHkiLCJjaGFubmVsIjoic3RhYmxlIiwidmVyc2lvbiI6IjAuMS4wIiwic2NoZW1hVmVyc2lvbiI6MiwibWluVmVyc2lvbiI6IjAuMS4wIiwicHVibGlzaGVkQXQiOiIyMDI2LTA3LTEyVDAwOjAwOjAwLjAwMFoiLCJub3Rlc1VybCI6Imh0dHBzOi8vZ2l0aHViLmNvbS9IUUJhc2UvaHFiYXNlL3JlbGVhc2VzL3RhZy92MC4xLjAiLCJhcnRpZmFjdCI6eyJ1cmwiOiJodHRwczovL2JpbGxpbmcuaHFiYXNlLmlvL3YxL3JlbGVhc2VzL2NvbW11bml0eS8wLjEuMC9hcnRpZmFjdCIsInNoYTI1NiI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJzaXplIjowfSwia2V5SWQiOiJocWJhc2UtcmVsZWFzZS0yMDI2LTAxIn0",
  signature:
    "HmWdFK3jPQJxqGug8zwGjMv4FN3eeXa8hR-pkHuOw4rwHcFCTUnNW_OlSMgaHEOAv3rFRuSkOoiX1qazuW2KCg"
};

describe("Community updates", () => {
  it("verifies signed manifests and compares semantic versions", async () => {
    const status = await getUpdateStatus(
      { HQBASE_RELEASE_PUBLIC_KEY: publicKey } as WorkerEnv,
      async () => Response.json(envelope)
    );
    expect(status).toMatchObject({
      edition: "community",
      installedVersion: "0.1.1",
      latestIsNewer: false,
      available: false,
      compatible: true
    });
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
  });

  it("rejects a tampered manifest", async () => {
    await expect(
      getUpdateStatus({ HQBASE_RELEASE_PUBLIC_KEY: publicKey } as WorkerEnv, async () =>
        Response.json({
          ...envelope,
          signature: `${envelope.signature.startsWith("A") ? "B" : "A"}${envelope.signature.slice(1)}`
        })
      )
    ).rejects.toThrow("signature");
  });

  it("discovers and triggers the production Workers Build without storing the token", async () => {
    const first = vi.fn().mockResolvedValue({ value_json: JSON.stringify("mail.example.com") });
    const db = {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) }))
    } as unknown as D1Database;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
        "Bearer temporary-token-that-is-long-enough"
      );
      const url = String(input);
      if (url.includes("/zones?"))
        return Response.json({
          success: true,
          result: [{ name: "example.com", account: { id: "account" } }]
        });
      if (url.endsWith("/workers/scripts"))
        return Response.json({ success: true, result: [{ id: "hqbase", tag: "worker-tag" }] });
      if (url.endsWith("/triggers"))
        return Response.json({
          success: true,
          result: [{ id: "trigger", branch_includes: ["main"] }]
        });
      return Response.json({ success: true, result: { build_uuid: "build-id", status: "queued" } });
    });
    await expect(
      triggerUpdate(
        { DB: db, HQBASE_WORKER_NAME: "hqbase" } as WorkerEnv,
        "temporary-token-that-is-long-enough",
        fetcher as typeof fetch
      )
    ).resolves.toEqual({ buildId: "build-id", status: "queued" });
  });
});
