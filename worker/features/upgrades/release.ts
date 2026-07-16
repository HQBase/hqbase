import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { UpgradeRecord } from "./types";

export type ProWorkerBundle = {
  format: "hqbase-worker-bundle-v1";
  edition: "pro";
  version: string;
  schemaVersion: number;
  compatibilityDate: string;
  compatibilityFlags: string[];
  main: { name: string; sha256: string; contentBase64: string };
  assets: Array<{
    path: string;
    hash: string;
    size: number;
    contentType: string;
    contentBase64: string;
  }>;
  migrations: Array<{ name: string; sha256: string; sql: string }>;
};

type ReleaseManifest = {
  format: string;
  edition: string;
  version: string;
  schemaVersion: number;
  deploymentArtifact?: { url: string; sha256: string; size: number };
};

export async function downloadVerifiedProBundle(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  licenseKey: string,
  fetcher: typeof fetch = fetch
): Promise<ProWorkerBundle> {
  const releases = env.HQBASE_RELEASES_URL ?? "https://billing.hqbase.io/v1/releases";
  const envelopeResponse = await fetcher(`${releases}/pro/stable`, {
    headers: { accept: "application/json" }
  });
  const envelope = (await safeJson(envelopeResponse)) as { payload?: string; signature?: string };
  if (!envelopeResponse.ok || !envelope.payload || !envelope.signature) {
    throw new AppError(
      "UPGRADE_RELEASE_UNAVAILABLE",
      "The signed Pro release is unavailable.",
      503
    );
  }
  await verifyEnvelope(envelope.payload, envelope.signature, env.HQBASE_RELEASE_PUBLIC_KEY);
  const manifest = JSON.parse(fromBase64UrlText(envelope.payload)) as ReleaseManifest;
  if (
    manifest.format !== "hqbase-release-v1" ||
    manifest.edition !== "pro" ||
    !/^\d+\.\d+\.\d+/.test(manifest.version) ||
    !manifest.deploymentArtifact ||
    !/^[a-f0-9]{64}$/.test(manifest.deploymentArtifact.sha256) ||
    manifest.deploymentArtifact.size <= 0
  ) {
    throw new AppError(
      "UPGRADE_RELEASE_INCOMPATIBLE",
      "The current Pro release cannot be installed in place.",
      409
    );
  }
  const billing = env.HQBASE_BILLING_URL ?? "https://billing.hqbase.io";
  const authorization = await fetcher(
    `${billing}/v1/releases/pro/${encodeURIComponent(manifest.version)}/authorize`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        licenseKey,
        installationId: upgrade.installationId,
        hostname: new URL(upgrade.workspaceOrigin).hostname,
        appVersion: env.HQBASE_APP_VERSION ?? "0.1.4"
      })
    }
  );
  const grant = (await safeJson(authorization)) as {
    deploymentArtifactUrl?: string;
    downloadToken?: string;
  };
  if (!authorization.ok || !grant.deploymentArtifactUrl || !grant.downloadToken) {
    throw new AppError(
      "UPGRADE_ENTITLEMENT_INVALID",
      "The Pro purchase could not authorize the signed release.",
      403
    );
  }
  const artifactResponse = await fetcher(grant.deploymentArtifactUrl, {
    headers: { authorization: `Bearer ${grant.downloadToken}` }
  });
  const artifactBytes = new Uint8Array(await artifactResponse.arrayBuffer());
  if (
    !artifactResponse.ok ||
    artifactBytes.byteLength !== manifest.deploymentArtifact.size ||
    (await sha256Hex(artifactBytes)) !== manifest.deploymentArtifact.sha256
  ) {
    throw new AppError(
      "UPGRADE_RELEASE_INTEGRITY_FAILED",
      "The signed Pro deployment artifact failed verification.",
      502
    );
  }
  const bundle = JSON.parse(new TextDecoder().decode(artifactBytes)) as ProWorkerBundle;
  await verifyBundle(bundle, manifest);
  return bundle;
}

async function verifyEnvelope(
  payload: string,
  signature: string,
  publicKey?: string
): Promise<void> {
  if (!publicKey) {
    throw new AppError("UPGRADE_RELEASE_KEY_MISSING", "Release verification is unavailable.", 503);
  }
  const key = await crypto.subtle.importKey(
    "spki",
    arrayBuffer(fromBase64(publicKey)),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    arrayBuffer(fromBase64Url(signature)),
    arrayBuffer(fromBase64Url(payload))
  );
  if (!valid) {
    throw new AppError(
      "UPGRADE_RELEASE_SIGNATURE_FAILED",
      "The Pro release signature is invalid.",
      502
    );
  }
}

async function verifyBundle(bundle: ProWorkerBundle, manifest: ReleaseManifest): Promise<void> {
  if (
    bundle.format !== "hqbase-worker-bundle-v1" ||
    bundle.edition !== "pro" ||
    bundle.version !== manifest.version ||
    bundle.schemaVersion !== manifest.schemaVersion ||
    bundle.main.name !== "index.js" ||
    (await sha256Hex(fromBase64(bundle.main.contentBase64))) !== bundle.main.sha256 ||
    !Array.isArray(bundle.assets) ||
    !Array.isArray(bundle.migrations)
  ) {
    throw new AppError(
      "UPGRADE_RELEASE_CONTENT_INVALID",
      "The Pro deployment artifact is malformed.",
      502
    );
  }
  for (const migration of bundle.migrations) {
    if ((await sha256Hex(new TextEncoder().encode(migration.sql))) !== migration.sha256) {
      throw new AppError(
        "UPGRADE_MIGRATION_INTEGRITY_FAILED",
        "A signed Pro migration failed verification.",
        502
      );
    }
  }
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", arrayBuffer(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function fromBase64Url(value: string): Uint8Array {
  return fromBase64(
    value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=")
  );
}

function fromBase64UrlText(value: string): string {
  return new TextDecoder().decode(fromBase64Url(value));
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
