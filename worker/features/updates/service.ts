import { z } from "zod";
import { getSetting } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { ReleaseManifest, UpdateStatus } from "./types";

const edition = "community" as const;
const installedSchemaVersion = 2;
const defaultReleaseUrl = "https://billing.hqbase.io/v1/releases";

const envelopeSchema = z.object({
  payload: z.string().min(1),
  signature: z.string().min(1)
});
const manifestSchema = z.object({
  format: z.literal("hqbase-release-v1"),
  edition: z.enum(["community", "pro"]),
  channel: z.literal("stable"),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  schemaVersion: z.number().int().positive(),
  minVersion: z.string(),
  publishedAt: z.string().datetime(),
  notesUrl: z.string().url(),
  artifact: z.object({
    url: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative()
  }),
  keyId: z.literal("hqbase-release-2026-01")
});

export async function getUpdateStatus(
  env: WorkerEnv,
  fetcher: typeof fetch = fetch
): Promise<UpdateStatus> {
  const installedVersion = env.HQBASE_APP_VERSION ?? "0.1.1";
  const response = await fetcher(
    `${env.HQBASE_RELEASES_URL ?? defaultReleaseUrl}/${edition}/stable`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) }
  );
  if (!response.ok)
    throw new AppError("UPDATE_CHECK_FAILED", "Update service is unavailable.", 503);
  const envelope = envelopeSchema.parse(await response.json());
  if (!(await verifyEnvelope(envelope, env.HQBASE_RELEASE_PUBLIC_KEY))) {
    throw new AppError("UPDATE_SIGNATURE_INVALID", "Release signature verification failed.", 503);
  }
  const release = manifestSchema.parse(JSON.parse(decodeBase64Url(envelope.payload)));
  if (release.edition !== edition) {
    throw new AppError(
      "UPDATE_EDITION_INVALID",
      "Release edition does not match this installation.",
      503
    );
  }
  return {
    edition,
    installedVersion,
    installedSchemaVersion,
    channel: "stable",
    checkedAt: new Date().toISOString(),
    available: compareVersions(release.version, installedVersion) > 0,
    compatible: compareVersions(installedVersion, release.minVersion) >= 0,
    release: release as ReleaseManifest
  };
}

export async function triggerUpdate(
  env: WorkerEnv,
  apiToken: string,
  fetcher: typeof fetch = fetch
): Promise<{ buildId: string; status: string }> {
  const domain = await getSetting(env.DB, "primary_domain", z.string());
  if (!domain)
    throw new AppError("UPDATE_DOMAIN_REQUIRED", "Configure the primary domain first.", 409);
  const headers = { authorization: `Bearer ${apiToken}`, "content-type": "application/json" };
  const zones = await cloudflare<{ result: Array<{ name: string; account: { id: string } }> }>(
    "https://api.cloudflare.com/client/v4/zones?per_page=50",
    { headers },
    fetcher
  );
  const zone = zones.result
    .filter((candidate) => domain === candidate.name || domain.endsWith(`.${candidate.name}`))
    .sort((left, right) => right.name.length - left.name.length)[0];
  if (!zone)
    throw new AppError(
      "UPDATE_ACCOUNT_NOT_FOUND",
      "The token cannot access the workspace zone.",
      403
    );
  const accountId = zone.account.id;
  const scripts = await cloudflare<{ result: Array<{ id: string; tag?: string }> }>(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
    { headers },
    fetcher
  );
  const workerName = env.HQBASE_WORKER_NAME ?? "hqbase";
  const script = scripts.result.find((candidate) => candidate.id === workerName);
  if (!script?.tag)
    throw new AppError(
      "UPDATE_WORKER_NOT_FOUND",
      "The production Worker build could not be found.",
      404
    );
  const triggers = await cloudflare<{
    result: Array<{ id?: string; trigger_uuid?: string; branch_includes?: string[] }>;
  }>(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/workers/${script.tag}/triggers`,
    { headers },
    fetcher
  );
  const trigger =
    triggers.result.find((item) => item.branch_includes?.includes("main")) ?? triggers.result[0];
  if (!trigger)
    throw new AppError(
      "UPDATE_TRIGGER_NOT_FOUND",
      "Connect this Worker to Workers Builds before updating.",
      409
    );
  const build = await cloudflare<{ result: { build_uuid?: string; id?: string; status?: string } }>(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/triggers/${trigger.trigger_uuid ?? trigger.id}/builds`,
    { method: "POST", headers, body: JSON.stringify({ branch: "main" }) },
    fetcher
  );
  const buildId = build.result.build_uuid ?? build.result.id;
  if (!buildId)
    throw new AppError(
      "UPDATE_TRIGGER_FAILED",
      "Cloudflare did not return a build identifier.",
      502
    );
  return { buildId, status: build.result.status ?? "queued" };
}

async function verifyEnvelope(
  envelope: { payload: string; signature: string },
  publicKeyBase64: string | undefined
): Promise<boolean> {
  if (!publicKeyBase64) return false;
  const key = await crypto.subtle.importKey(
    "spki",
    decodeBase64(publicKeyBase64),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "Ed25519",
    key,
    decodeBase64UrlBytes(envelope.signature),
    decodeBase64UrlBytes(envelope.payload)
  );
}

async function cloudflare<T>(url: string, init: RequestInit, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, init);
  const body = (await response.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || body.success === false) {
    throw new AppError(
      "UPDATE_CLOUDFLARE_ERROR",
      body.errors?.[0]?.message ?? "Cloudflare rejected the update request.",
      response.status === 401 || response.status === 403 ? 403 : 502
    );
  }
  return body as T;
}

export function compareVersions(left: string, right: string): number {
  const a = (left.split("-")[0] ?? "0").split(".").map(Number);
  const b = (right.split("-")[0] ?? "0").split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return left.includes("-") === right.includes("-") ? 0 : left.includes("-") ? -1 : 1;
}

function decodeBase64(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

function decodeBase64UrlBytes(value: string): ArrayBuffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return decodeBase64(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}
