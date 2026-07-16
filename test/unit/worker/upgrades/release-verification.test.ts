import { describe, expect, it } from "vitest";
import { downloadVerifiedProBundle } from "../../../../worker/features/upgrades/release";
import type { UpgradeRecord } from "../../../../worker/features/upgrades/types";
import type { WorkerEnv } from "../../../../worker/lib/env";

describe("in-place Pro release verification", () => {
  it("accepts an artifact whose manifest signs the decoded payload bytes", async () => {
    const keys = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify"
    ])) as CryptoKeyPair;
    const main = new TextEncoder().encode("export default {};");
    const bundle = {
      format: "hqbase-worker-bundle-v1",
      edition: "pro",
      version: "0.1.4",
      schemaVersion: 11,
      compatibilityDate: "2026-07-11",
      compatibilityFlags: ["nodejs_compat"],
      communityUpgrade: {
        sourceSchemaVersions: [5],
        targetSchemaVersion: 11
      },
      main: {
        name: "index.js",
        sha256: await sha256Hex(main),
        contentBase64: base64(main)
      },
      assets: [],
      migrations: []
    } as const;
    const artifact = new TextEncoder().encode(`${JSON.stringify(bundle)}\n`);
    const manifest = {
      format: "hqbase-release-v1",
      edition: "pro",
      channel: "stable",
      version: bundle.version,
      schemaVersion: bundle.schemaVersion,
      deploymentArtifact: {
        url: "https://billing.example/deployment-artifact",
        sha256: await sha256Hex(artifact),
        size: artifact.byteLength
      }
    };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const payload = base64Url(payloadBytes);
    const signature = base64Url(
      new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, payloadBytes))
    );
    const publicKey = base64(new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey)));
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/pro/stable")) return Response.json({ payload, signature });
      if (url.endsWith("/authorize")) {
        return Response.json({
          deploymentArtifactUrl: "https://billing.example/deployment-artifact",
          downloadToken: "single-use-download"
        });
      }
      if (url === "https://billing.example/deployment-artifact") {
        return new Response(artifact);
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const upgrade = {
      installationId: "00000000-0000-4000-8000-000000000001",
      workspaceOrigin: "https://mail.example.com"
    } as UpgradeRecord;
    const result = await downloadVerifiedProBundle(
      {
        HQBASE_RELEASES_URL: "https://billing.example/releases",
        HQBASE_BILLING_URL: "https://billing.example",
        HQBASE_RELEASE_PUBLIC_KEY: publicKey,
        HQBASE_APP_VERSION: "0.1.4"
      } as WorkerEnv,
      upgrade,
      "test-license",
      fetcher
    );
    expect(result.version).toBe("0.1.4");
  });
});

async function sha256Hex(value: Uint8Array): Promise<string> {
  const bytes = value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength
  ) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function base64Url(value: Uint8Array): string {
  return base64(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
