import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  compareVersions,
  normalizeConfig,
  verifyManifest
} from "../../../scripts/release/deploy.mjs";

describe("Community release deployment", () => {
  it("verifies edition-bound manifests", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest = {
      format: "hqbase-release-v1",
      edition: "community",
      channel: "stable",
      version: "1.2.3",
      artifact: { sha256: "a".repeat(64), size: 1 }
    };
    const payload = Buffer.from(JSON.stringify(manifest)).toString("base64url");
    const envelope = {
      payload,
      signature: sign(null, Buffer.from(payload, "base64url"), privateKey).toString("base64url")
    };
    const encoded = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(verifyManifest(envelope, encoded)).toMatchObject({ version: "1.2.3" });
    expect(() =>
      verifyManifest({ ...envelope, signature: `A${envelope.signature.slice(1)}` }, encoded)
    ).toThrow("signature");
  });
  it("selects only newer semantic releases", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });
  it("rebases customer deployment paths onto the verified release source", () => {
    expect(
      normalizeConfig(
        {
          main: "../../../worker/index.ts",
          assets: { directory: "../../../dist", binding: "ASSETS" },
          d1_databases: [{ binding: "DB", migrations_dir: "../../../migrations" }],
          vars: { HQBASE_WORKER_NAME: "customer-worker" }
        },
        "0.1.1"
      )
    ).toMatchObject({
      main: "worker/index.ts",
      assets: { directory: "./dist", binding: "ASSETS" },
      d1_databases: [{ binding: "DB", migrations_dir: "migrations" }],
      vars: { HQBASE_APP_VERSION: "0.1.1", HQBASE_WORKER_NAME: "customer-worker" }
    });
  });
});
