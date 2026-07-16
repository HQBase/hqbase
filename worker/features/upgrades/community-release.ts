import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { UpgradeInventory } from "./types";

export async function verifySignedCommunityRelease(
  bindings: UpgradeInventory["bindings"],
  activeVersionTag: string | null,
  env: WorkerEnv,
  fetcher: typeof fetch
): Promise<void> {
  const editionVersion = bindings.find((binding) => binding.name === "HQBASE_APP_VERSION");
  const releaseKey = bindings.find((binding) => binding.name === "HQBASE_RELEASE_PUBLIC_KEY");
  const version = editionVersion?.type === "plain_text" ? editionVersion.text : null;
  const key = releaseKey?.type === "plain_text" ? releaseKey.text : null;
  if (
    typeof version !== "string" ||
    typeof key !== "string" ||
    key !== env.HQBASE_RELEASE_PUBLIC_KEY
  ) {
    throw unsupportedRelease();
  }

  const response = await fetcher(
    `${env.HQBASE_RELEASES_URL ?? "https://billing.hqbase.io/v1/releases"}/community/${encodeURIComponent(version)}/manifest`,
    { headers: { accept: "application/json" } }
  );
  const envelope = (await safeJson(response)) as { payload?: string; signature?: string } | null;
  if (!response.ok || !envelope?.payload || !envelope.signature || !env.HQBASE_RELEASE_PUBLIC_KEY) {
    throw unsupportedRelease();
  }
  try {
    const publicKey = await crypto.subtle.importKey(
      "spki",
      arrayBuffer(fromBase64(env.HQBASE_RELEASE_PUBLIC_KEY)),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      arrayBuffer(fromBase64Url(envelope.signature)),
      arrayBuffer(fromBase64Url(envelope.payload))
    );
    const manifest = JSON.parse(new TextDecoder().decode(fromBase64Url(envelope.payload))) as {
      format?: string;
      edition?: string;
      channel?: string;
      version?: string;
      minVersion?: string;
      artifact?: { sha256?: string };
    };
    if (
      !valid ||
      manifest.format !== "hqbase-release-v1" ||
      manifest.edition !== "community" ||
      manifest.channel !== "stable" ||
      manifest.version !== version ||
      typeof manifest.minVersion !== "string" ||
      !/^[a-f0-9]{64}$/.test(manifest.artifact?.sha256 ?? "") ||
      activeVersionTag !==
        `hqbase-community:${version}:${manifest.artifact?.sha256 ?? "missing"}` ||
      compareVersions(version, manifest.minVersion) < 0
    ) {
      throw unsupportedRelease();
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unsupportedRelease();
  }
}

function unsupportedRelease(): AppError {
  return new AppError(
    "UPGRADE_RELEASE_UNSUPPORTED",
    "Update this Community workspace to the latest signed release before retrying Pro upgrade.",
    409
  );
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split("-")[0]?.split(".").map(Number) ?? [];
  const rightParts = right.split("-")[0]?.split(".").map(Number) ?? [];
  if (
    leftParts.length !== 3 ||
    rightParts.length !== 3 ||
    [...leftParts, ...rightParts].some(Number.isNaN)
  ) {
    throw unsupportedRelease();
  }
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
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
