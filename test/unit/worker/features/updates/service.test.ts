import { generateKeyPairSync, sign } from "node:crypto";
import { compareVersions, getUpdateStatus, triggerUpdate } from "@worker/features/updates/service";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it, vi } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const payload = Buffer.from(
  JSON.stringify({
    format: "hqbase-release-v1",
    product: "hqbase",
    channel: "stable",
    version: "0.1.0",
    schemaVersion: 2,
    minVersion: "0.1.0",
    publishedAt: "2026-07-12T00:00:00.000Z",
    notesUrl: "https://github.com/HQBase/hqbase/releases/tag/v0.1.0",
    artifact: {
      url: "https://github.com/HQBase/hqbase/releases/download/v0.1.0/hqbase-0.1.0.tar.gz",
      sha256: "0".repeat(64),
      size: 0
    },
    keyId: "hqbase-release-2026-01"
  })
).toString("base64url");
const envelope = {
  payload,
  signature: sign(null, Buffer.from(payload, "base64url"), privateKey).toString("base64url")
};

describe("HQBase updates", () => {
  it("verifies signed manifests", async () => {
    const status = await getUpdateStatus(
      { HQBASE_RELEASE_PUBLIC_KEY: publicKeyBase64 } as WorkerEnv,
      async () => Response.json(envelope)
    );
    expect(status).toMatchObject({
      product: "hqbase",
      installedVersion: "0.1.1",
      available: false,
      compatible: true
    });
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
  });
  it("rejects a tampered manifest", async () => {
    const replacement = envelope.signature.startsWith("A") ? "B" : "A";
    await expect(
      getUpdateStatus({ HQBASE_RELEASE_PUBLIC_KEY: publicKeyBase64 } as WorkerEnv, async () =>
        Response.json({ ...envelope, signature: `${replacement}${envelope.signature.slice(1)}` })
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
        return Response.json({ success: true, result: [{ id: "hqbase", tag: "worker-tag" }] });
      if (url.endsWith("/triggers"))
        return Response.json({ success: true, result: [{ id: "trigger" }] });
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
