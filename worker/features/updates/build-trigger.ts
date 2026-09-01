import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import type { ReleaseManifest } from "./types";

export const expectedReleaseVariable = "HQBASE_EXPECTED_RELEASE_VERSION";
export const forceSourceDeployVariable = "HQBASE_FORCE_SOURCE_DEPLOY";
export const updaterLoaderVariable = "HQBASE_UPDATER_LOADER";
const legacyManagedDeployCommands = new Set(["pnpm deploy", "pnpm run deploy"]);

export type BuildVariable = { is_secret: boolean; value?: string | null };
export type BuildConfiguration = {
  deployCommand: string;
  variables: Record<string, BuildVariable>;
};
type BuildResponse = {
  build_trigger_metadata?: {
    branch?: string;
    build_trigger_source?: string;
    deploy_command?: string;
    environment_variables?: Record<string, string>;
  };
  build_uuid?: string;
  created_on?: string;
  status?: string;
  trigger?: { trigger_uuid?: string };
};

export function assertManagedTrigger(trigger: {
  deploy_command?: string | null;
  root_directory?: string | null;
}): void {
  const command = trigger.deploy_command?.trim() ?? "";
  const root = trigger.root_directory?.trim() ?? "";
  if (!isManagedDeployCommand(command) || !["", "/", ".", "./"].includes(root)) {
    throw new AppError(
      "UPDATE_TRIGGER_UNMANAGED",
      "Signed updates require a repository-root Workers Builds trigger that uses the HQBase updater. Use the custom-source deployment process instead.",
      409
    );
  }
}

export function managedDeployCommand(): string {
  return 'node --input-type=module --eval "$HQBASE_UPDATER_LOADER"';
}

export function managedUpdaterLoader(updater: NonNullable<ReleaseManifest["updater"]>): string {
  const { sha256, size, sourceUrl } = updater;
  return `const u="${sourceUrl}";const h="${sha256}";const n=${size};const r=await fetch(u);if(!r.ok)throw new Error("HQBase updater download failed.");const b=Buffer.from(await r.arrayBuffer());const {createHash}=await import("node:crypto");if(b.length!==n||createHash("sha256").update(b).digest("hex")!==h)throw new Error("HQBase updater verification failed.");await import("data:text/javascript;base64,"+b.toString("base64"));`;
}

export function isManagedDeployCommand(command: string): boolean {
  const trimmed = command.trim();
  if (legacyManagedDeployCommands.has(trimmed.replace(/\s+/g, " "))) return true;
  if (trimmed === managedDeployCommand()) return true;
  const match = trimmed.match(
    /^node --input-type=module --eval 'const u="(https:\/\/raw\.githubusercontent\.com\/HQBase\/hqbase\/[a-f0-9]{40}\/scripts\/release\/bootstrap\.mjs)";const h="([a-f0-9]{64})";const n=([1-9]\d*);/
  );
  if (!match) return false;
  const sourceUrl = match[1];
  const sha256 = match[2];
  const size = match[3];
  if (!sourceUrl || !sha256 || !size) return false;
  return (
    trimmed ===
    `node --input-type=module --eval '${managedUpdaterLoader({
      protocol: 2,
      sha256,
      size: Number(size),
      sourceUrl
    })}'`
  );
}

export async function setBuildDeployCommand(
  url: string,
  deployCommand: string,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<void> {
  await cloudflare(
    url,
    { method: "PATCH", headers, body: JSON.stringify({ deploy_command: deployCommand }) },
    fetcher,
    "set_build_command"
  );
}

export async function setBuildUpdaterVariables(
  url: string,
  loader: string,
  version: string,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<void> {
  await cloudflare(
    url,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        [updaterLoaderVariable]: { is_secret: false, value: loader },
        [expectedReleaseVariable]: { is_secret: false, value: version }
      })
    },
    fetcher,
    "set_build_variables"
  );
}

async function restoreBuildConfiguration(
  triggerUrl: string,
  triggersUrl: string,
  triggerId: string,
  variablesUrl: string,
  previous: BuildConfiguration,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<void> {
  let current = await readBuildConfiguration(
    triggersUrl,
    triggerId,
    variablesUrl,
    headers,
    fetcher
  );
  if (current.deployCommand !== previous.deployCommand) {
    await setBuildDeployCommand(triggerUrl, previous.deployCommand, headers, fetcher);
  }
  for (const name of [updaterLoaderVariable, expectedReleaseVariable]) {
    if (!sameBuildVariable(current.variables[name], previous.variables[name])) {
      await restoreBuildVariable(variablesUrl, name, previous.variables[name], headers, fetcher);
    }
  }
  current = await readBuildConfiguration(triggersUrl, triggerId, variablesUrl, headers, fetcher);
  if (
    current.deployCommand !== previous.deployCommand ||
    !sameBuildVariable(
      current.variables[updaterLoaderVariable],
      previous.variables[updaterLoaderVariable]
    ) ||
    !sameBuildVariable(
      current.variables[expectedReleaseVariable],
      previous.variables[expectedReleaseVariable]
    )
  ) {
    throw new Error("Workers Builds configuration rollback could not be verified.");
  }
}

async function restoreBuildVariable(
  url: string,
  name: string,
  previous: BuildVariable | undefined,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<void> {
  if (typeof previous?.value === "string") {
    await cloudflare(
      url,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ [name]: { is_secret: false, value: previous.value } })
      },
      fetcher,
      "set_build_variables"
    );
    return;
  }
  await cloudflare(
    `${url}/${name}`,
    { method: "DELETE", headers },
    fetcher,
    "delete_build_variable"
  );
}

export async function verifyBuildConfiguration(
  triggersUrl: string,
  triggerId: string,
  variablesUrl: string,
  expected: { deployCommand: string; loader: string; version: string },
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<void> {
  const current = await readBuildConfiguration(
    triggersUrl,
    triggerId,
    variablesUrl,
    headers,
    fetcher
  );
  if (
    current.deployCommand !== expected.deployCommand ||
    !buildVariableEquals(current.variables[updaterLoaderVariable], expected.loader) ||
    !buildVariableEquals(current.variables[expectedReleaseVariable], expected.version)
  ) {
    throw new AppError(
      "UPDATE_TRIGGER_CONFIGURATION_MISMATCH",
      "Cloudflare did not keep the verified signed updater configuration. The build did not start.",
      502
    );
  }
}

async function readBuildConfiguration(
  triggersUrl: string,
  triggerId: string,
  variablesUrl: string,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<BuildConfiguration> {
  const [triggers, variables] = await Promise.all([
    cloudflare<{
      result: Array<{ id?: string; trigger_uuid?: string; deploy_command?: string | null }>;
    }>(triggersUrl, { headers }, fetcher, "read_build_trigger"),
    cloudflare<{ result: Record<string, BuildVariable> }>(
      variablesUrl,
      { headers },
      fetcher,
      "read_build_variables"
    )
  ]);
  const trigger = triggers.result.find(
    (candidate) => (candidate.trigger_uuid ?? candidate.id) === triggerId
  );
  if (!trigger) {
    throw new AppError(
      "UPDATE_TRIGGER_NOT_FOUND",
      "Cloudflare no longer reports the production build trigger.",
      502
    );
  }
  return {
    deployCommand: trigger.deploy_command?.trim() ?? "",
    variables: variables.result
  };
}

export function isRestorableBuildVariable(variable: BuildVariable | undefined): boolean {
  return variable === undefined || (!variable.is_secret && typeof variable.value === "string");
}

export function buildVariableEquals(variable: BuildVariable | undefined, value: string): boolean {
  return variable?.is_secret === false && variable.value === value;
}

function sameBuildVariable(
  left: BuildVariable | undefined,
  right: BuildVariable | undefined
): boolean {
  if (!left || !right) return left === right;
  return left.is_secret === right.is_secret && left.value === right.value;
}

export async function restoreOrThrow(
  triggerUrl: string,
  triggersUrl: string,
  triggerId: string,
  variablesUrl: string,
  previous: BuildConfiguration,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<void> {
  try {
    await restoreBuildConfiguration(
      triggerUrl,
      triggersUrl,
      triggerId,
      variablesUrl,
      previous,
      headers,
      fetcher
    );
  } catch {
    throw new AppError(
      "UPDATE_TRIGGER_ROLLBACK_FAILED",
      "The build did not start, and HQBase could not restore the previous Cloudflare build configuration. Review the production Workers Builds trigger before trying again.",
      502
    );
  }
}

export async function startBuild(
  accountId: string,
  triggerId: string,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<{ buildId: string; status: string }> {
  const build = await cloudflare<{
    result: { build_uuid?: string; id?: string; status?: string };
  }>(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/triggers/${triggerId}/builds`,
    { method: "POST", headers, body: JSON.stringify({ branch: "main" }) },
    fetcher,
    "start_build"
  );
  const buildId = build.result.build_uuid ?? build.result.id;
  if (buildId) return { buildId, status: build.result.status ?? "queued" };
  throw new AppError(
    "UPDATE_BUILD_STATUS_UNKNOWN",
    "Cloudflare accepted the build request but did not return a build identifier.",
    502
  );
}

export async function reconcileAcceptedBuild(
  accountId: string,
  scriptTag: string,
  triggerId: string,
  expectedVersion: string,
  expectedLoader: string,
  dispatchStartedAt: number,
  headers: Record<string, string>,
  fetcher: typeof fetch
): Promise<{ buildId: string; status: string } | null> {
  let latest: { result: { builds?: Record<string, BuildResponse> } };
  try {
    latest = await cloudflare(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/latest?external_script_ids=${encodeURIComponent(scriptTag)}`,
      { headers },
      fetcher,
      "read_latest_build"
    );
  } catch {
    return null;
  }
  const earliestAcceptedTime = dispatchStartedAt - 30_000;
  const latestAcceptedTime = Date.now() + 30_000;
  const accepted = Object.values(latest.result.builds ?? {}).find((build) => {
    const createdAt = Date.parse(build.created_on ?? "");
    const source = build.build_trigger_metadata?.build_trigger_source;
    return (
      typeof build.build_uuid === "string" &&
      build.trigger?.trigger_uuid === triggerId &&
      build.build_trigger_metadata?.branch === "main" &&
      build.build_trigger_metadata.deploy_command === managedDeployCommand() &&
      build.build_trigger_metadata.environment_variables?.[expectedReleaseVariable] ===
        expectedVersion &&
      build.build_trigger_metadata.environment_variables?.[updaterLoaderVariable] ===
        expectedLoader &&
      (source === "api" || source === "manual") &&
      Number.isFinite(createdAt) &&
      createdAt >= earliestAcceptedTime &&
      createdAt <= latestAcceptedTime
    );
  });
  return accepted?.build_uuid
    ? { buildId: accepted.build_uuid, status: accepted.status ?? "queued" }
    : null;
}
