import { z } from "zod";
import { getSetting } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { hqbaseProductConfig } from "../../lib/product-config";
import { withUpdateBuildLock } from "./build-lock";
import {
  assertManagedTrigger,
  type BuildConfiguration,
  type BuildVariable,
  buildVariableEquals,
  expectedReleaseVariable,
  forceSourceDeployVariable,
  isManagedDeployCommand,
  isRestorableBuildVariable,
  managedDeployCommand,
  managedUpdaterLoader,
  reconcileAcceptedBuild,
  restoreOrThrow,
  setBuildDeployCommand,
  setBuildUpdaterVariables,
  startBuild,
  updaterLoaderVariable,
  verifyBuildConfiguration
} from "./build-trigger";
import { cloudflare, isAmbiguousCloudflareOperation } from "./cloudflare";
import { inspectManagedMigrationState, type ManagedMigrationState } from "./migration-state";
import type { ReleaseManifest, UpdateStatus } from "./types";

export { isManagedDeployCommand, managedDeployCommand, managedUpdaterLoader };

const envelopeSchema = z.object({ payload: z.string().min(1), signature: z.string().min(1) });
const manifestSchema = z.object({
  format: z.literal("hqbase-release-v1"),
  product: z.literal("hqbase"),
  channel: z.literal("stable"),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  schemaVersion: z.number().int().positive(),
  minVersion: z.string(),
  publishedAt: z.string().datetime(),
  notes: z.array(z.string().min(1).max(2_000)).max(100).optional().default([]),
  notesUrl: z.string().url(),
  artifact: z.object({
    url: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative()
  }),
  updater: z.object({
    protocol: z.literal(2),
    sourceUrl: z
      .string()
      .regex(
        /^https:\/\/raw\.githubusercontent\.com\/HQBase\/hqbase\/[a-f0-9]{40}\/scripts\/release\/bootstrap\.mjs$/
      ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive()
  }),
  keyId: z.literal("hqbase-release-2026-01")
});

export async function getUpdateStatus(
  env: WorkerEnv,
  fetcher: typeof fetch = fetch
): Promise<UpdateStatus> {
  const installedVersion = env.HQBASE_APP_VERSION ?? "0.1.1";
  const response = await fetcher(
    env.HQBASE_RELEASE_MANIFEST_URL?.trim() || hqbaseProductConfig.releaseManifestUrl,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) }
  );
  if (!response.ok)
    throw new AppError("UPDATE_CHECK_FAILED", "Update service is unavailable.", 503);
  const envelope = envelopeSchema.parse(await response.json());
  if (
    !(await verifyEnvelope(
      envelope,
      env.HQBASE_RELEASE_PUBLIC_KEY?.trim() || hqbaseProductConfig.releasePublicKey
    ))
  )
    throw new AppError("UPDATE_SIGNATURE_INVALID", "Release signature verification failed.", 503);
  const release = manifestSchema.parse(JSON.parse(decodeBase64Url(envelope.payload)));
  const releaseComparison = compareVersions(release.version, installedVersion);
  let migrationState: ManagedMigrationState | null = null;
  if (releaseComparison === 0) {
    try {
      migrationState = await inspectManagedMigrationState(
        env.DB,
        release.version,
        release.schemaVersion
      );
    } catch {
      throw new AppError(
        "UPDATE_SCHEMA_INCONSISTENT",
        "HQBase cannot verify this installation's database migration state. Run the signed deployment diagnostic before updating.",
        503
      );
    }
  }
  const repairRequired = migrationState?.repairRequired ?? false;
  return {
    product: "hqbase",
    installedVersion,
    installedSchemaVersion: 3,
    channel: "stable",
    checkedAt: new Date().toISOString(),
    available: releaseComparison > 0 || repairRequired,
    compatible: compareVersions(installedVersion, release.minVersion) >= 0,
    repairRequired,
    release: release as ReleaseManifest
  };
}

export async function triggerUpdate(
  env: WorkerEnv,
  apiToken: string,
  expectedVersion: string,
  fetcher: typeof fetch = fetch
): Promise<{ buildId: string; status: string }> {
  const update = await getUpdateStatus(env, fetcher);
  if (update.release.version !== expectedVersion) {
    throw new AppError(
      "UPDATE_RELEASE_CHANGED",
      "The signed release changed after you reviewed it. Check for updates again.",
      409
    );
  }
  if (!update.available) {
    throw new AppError("UPDATE_NOT_AVAILABLE", "This release is already installed.", 409);
  }
  if (!update.compatible) {
    throw new AppError(
      "UPDATE_INCOMPATIBLE",
      "This release cannot update directly from the installed version.",
      409
    );
  }
  const domain =
    (await getSetting(env.DB, "portal_host", z.string())) ??
    (await getSetting(env.DB, "primary_domain", z.string()));
  if (!domain)
    throw new AppError("UPDATE_DOMAIN_REQUIRED", "Configure the workspace portal first.", 409);
  const headers = { authorization: `Bearer ${apiToken}`, "content-type": "application/json" };
  const zones = await cloudflare<{ result: Array<{ name: string; account: { id: string } }> }>(
    "https://api.cloudflare.com/client/v4/zones?per_page=50",
    { headers },
    fetcher,
    "read_zones"
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
    fetcher,
    "read_workers"
  );
  const script = scripts.result.find(
    (candidate) => candidate.id === (env.HQBASE_WORKER_NAME ?? "hqbase")
  );
  if (!script?.tag)
    throw new AppError(
      "UPDATE_WORKER_NOT_FOUND",
      "The production Worker build could not be found.",
      404
    );
  const scriptTag = script.tag;
  const triggersUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/workers/${scriptTag}/triggers`;
  const triggers = await cloudflare<{
    result: Array<{
      id?: string;
      trigger_uuid?: string;
      branch_includes?: string[];
      deploy_command?: string | null;
      root_directory?: string | null;
    }>;
  }>(triggersUrl, { headers }, fetcher, "read_build_triggers");
  const trigger = triggers.result.find((item) => item.branch_includes?.includes("main"));
  if (!trigger)
    throw new AppError(
      "UPDATE_TRIGGER_NOT_FOUND",
      "Connect this Worker to Workers Builds before updating.",
      409
    );
  assertManagedTrigger(trigger);
  const triggerId = trigger.trigger_uuid ?? trigger.id;
  if (!triggerId)
    throw new AppError(
      "UPDATE_TRIGGER_INVALID",
      "Cloudflare returned an invalid production build trigger.",
      502
    );
  return withUpdateBuildLock(env.DB, triggerId, async () => {
    const triggerUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/triggers/${triggerId}`;
    const variablesUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/triggers/${triggerId}/environment_variables`;
    const variables = await cloudflare<{
      result: Record<string, BuildVariable>;
    }>(variablesUrl, { headers }, fetcher, "read_build_variables");
    const sourceDeploy = variables.result[forceSourceDeployVariable];
    if (sourceDeploy?.is_secret || sourceDeploy?.value?.trim() === "1") {
      throw new AppError(
        "UPDATE_TRIGGER_USES_SOURCE",
        "Signed updates are disabled because this build trigger uses custom source. Use the custom-source deployment process instead.",
        409
      );
    }
    const previousPin = variables.result[expectedReleaseVariable];
    const previousLoader = variables.result[updaterLoaderVariable];
    if (!isRestorableBuildVariable(previousPin) || !isRestorableBuildVariable(previousLoader)) {
      throw new AppError(
        "UPDATE_TRIGGER_UNMANAGED",
        "Signed updates require the updater loader and release version to be plain Workers Builds variables.",
        409
      );
    }
    const previousDeployCommand = trigger.deploy_command?.trim() ?? "";
    const previousConfiguration: BuildConfiguration = {
      deployCommand: previousDeployCommand,
      variables: structuredClone(variables.result)
    };
    const nextConfiguration = {
      deployCommand: managedDeployCommand(),
      loader: managedUpdaterLoader(update.release.updater),
      version: expectedVersion
    };
    try {
      if (
        !buildVariableEquals(previousLoader, nextConfiguration.loader) ||
        !buildVariableEquals(previousPin, nextConfiguration.version)
      ) {
        await setBuildUpdaterVariables(
          variablesUrl,
          nextConfiguration.loader,
          nextConfiguration.version,
          headers,
          fetcher
        );
      }
      if (previousDeployCommand !== nextConfiguration.deployCommand) {
        await setBuildDeployCommand(triggerUrl, nextConfiguration.deployCommand, headers, fetcher);
      }
      await verifyBuildConfiguration(
        triggersUrl,
        triggerId,
        variablesUrl,
        nextConfiguration,
        headers,
        fetcher
      );
    } catch (error) {
      await restoreOrThrow(
        triggerUrl,
        triggersUrl,
        triggerId,
        variablesUrl,
        previousConfiguration,
        headers,
        fetcher
      );
      throw error;
    }

    const dispatchStartedAt = Date.now();
    try {
      return await startBuild(accountId, triggerId, headers, fetcher);
    } catch (error) {
      if (
        isAmbiguousCloudflareOperation(error, "start_build") ||
        (error instanceof AppError && error.code === "UPDATE_BUILD_STATUS_UNKNOWN")
      ) {
        const accepted = await reconcileAcceptedBuild(
          accountId,
          scriptTag,
          triggerId,
          expectedVersion,
          nextConfiguration.loader,
          dispatchStartedAt,
          headers,
          fetcher
        );
        if (accepted) return accepted;
        throw new AppError(
          "UPDATE_BUILD_STATUS_UNKNOWN",
          "Cloudflare did not confirm whether the Workers Build started. The verified update configuration remains in place. Check the production Workers Builds history before you try again.",
          502
        );
      }
      await restoreOrThrow(
        triggerUrl,
        triggersUrl,
        triggerId,
        variablesUrl,
        previousConfiguration,
        headers,
        fetcher
      );
      throw error;
    }
  });
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
