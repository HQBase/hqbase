import { compareVersions, getUpdateStatus, triggerUpdate } from "@worker/features/updates/service";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it, vi } from "vitest";

const publicKey = "MCowBQYDK2VwAyEAsVwKniCvpHDwbbnjTPP0SuIIG97cRL+iFBQvay9OrU4=";
const envelope = {
  payload:
    "eyJmb3JtYXQiOiJocWJhc2UtcmVsZWFzZS12MSIsImVkaXRpb24iOiJwcm8iLCJjaGFubmVsIjoic3RhYmxlIiwidmVyc2lvbiI6IjAuMS4wIiwic2NoZW1hVmVyc2lvbiI6OSwibWluVmVyc2lvbiI6IjAuMS4wIiwicHVibGlzaGVkQXQiOiIyMDI2LTA3LTEyVDAwOjAwOjAwLjAwMFoiLCJub3Rlc1VybCI6Imh0dHBzOi8vZ2l0aHViLmNvbS9IUUJhc2UvaHFiYXNlLXByby1kZXBsb3kvcmVsZWFzZXMvdGFnL3YwLjEuMCIsImFydGlmYWN0Ijp7InVybCI6Imh0dHBzOi8vYmlsbGluZy5ocWJhc2UuaW8vdjEvcmVsZWFzZXMvcHJvLzAuMS4wL2FydGlmYWN0Iiwic2hhMjU2IjoiMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsInNpemUiOjB9LCJrZXlJZCI6ImhxYmFzZS1yZWxlYXNlLTIwMjYtMDEifQ",
  signature:
    "D77d_lUBBpbZZ_5-Cbsapjft4NdJ4ssLhwaaNu39fkdvJdtUVzPv4KEGByLFnRhmCgMX9LyXqyb1BeDbsFYZDA"
};

describe("Pro updates", () => {
  it("verifies signed manifests", async () => {
    const status = await getUpdateStatus(
      { HQBASE_RELEASE_PUBLIC_KEY: publicKey } as WorkerEnv,
      async () => Response.json(envelope)
    );
    expect(status).toMatchObject({
      edition: "pro",
      installedVersion: "0.1.1",
      available: false,
      compatible: true
    });
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
  });
  it("rejects a tampered manifest", async () => {
    await expect(
      getUpdateStatus({ HQBASE_RELEASE_PUBLIC_KEY: publicKey } as WorkerEnv, async () =>
        Response.json({ ...envelope, signature: `A${envelope.signature.slice(1)}` })
      )
    ).rejects.toThrow("signature");
  });
  it("triggers the production Workers Build", async () => {
    const first = vi.fn().mockResolvedValue({ value_json: JSON.stringify("mail.example.com") });
    const db = {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) }))
    } as unknown as D1Database;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/zones?"))
        return Response.json({
          success: true,
          result: [{ name: "example.com", account: { id: "account" } }]
        });
      if (url.endsWith("/workers/scripts"))
        return Response.json({ success: true, result: [{ id: "hqbase-pro", tag: "worker-tag" }] });
      if (url.endsWith("/triggers"))
        return Response.json({ success: true, result: [{ id: "trigger" }] });
      return Response.json({ success: true, result: { build_uuid: "build-id", status: "queued" } });
    });
    await expect(
      triggerUpdate(
        { DB: db, HQBASE_WORKER_NAME: "hqbase-pro" } as WorkerEnv,
        "temporary-token-that-is-long-enough",
        fetcher as typeof fetch
      )
    ).resolves.toEqual({ buildId: "build-id", status: "queued" });
  });
});
