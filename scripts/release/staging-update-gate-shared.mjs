import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertCurrentManifest } from "../hqbase/lifecycle-manifest.mjs";
import { configPath, loadManifest, manifestExists, writeManifest } from "../hqbase/manifest.mjs";
import { run } from "./command.mjs";

const apiBase = "https://api.cloudflare.com/client/v4";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const workerTagPattern = /^[0-9a-f]{32}$/i;
export const managedCommand = 'node --input-type=module --eval "$HQBASE_UPDATER_LOADER"';
export const initialBuildCommand = "sleep 600";
export const initialDeployCommand = "pnpm deploy";
export const gatePath = ".hqbase-release-gate-never";
export const branch = "main";
export const terminalOutcomes = new Set(["cancelled", "terminated"]);
export const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function createRuntimeGrantCookie(token, secret, iv = randomBytes(12)) {
  const key = createHash("sha256").update(`hqbase-runtime-cloudflare-oauth:${secret}`).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  return `hqb_cf_oauth_grant=${encodeURIComponent(`${iv.toString("base64url")}.${encrypted.toString("base64url")}`)}`;
}

export function managedUpdaterLoader(updater) {
  const { sha256, size, sourceUrl } = updater;
  return `const u="${sourceUrl}";const h="${sha256}";const n=${size};const r=await fetch(u);if(!r.ok)throw new Error("HQBase updater download failed.");const b=Buffer.from(await r.arrayBuffer());const {createHash}=await import("node:crypto");if(b.length!==n||createHash("sha256").update(b).digest("hex")!==h)throw new Error("HQBase updater verification failed.");await import("data:text/javascript;base64,"+b.toString("base64"));`;
}

export async function listWorkers(context, dependencies) {
  const result = await cloudflareResult(
    `/accounts/${context.accountId}/workers/scripts`,
    { headers: cloudflareHeaders(context.cleanupToken) },
    dependencies.fetcher
  );
  return Array.isArray(result) ? result : [];
}

export async function listTriggers(workerTag, context, dependencies) {
  const result = await cloudflareResult(
    `/accounts/${context.accountId}/builds/workers/${workerTag}/triggers`,
    { headers: cloudflareHeaders(context.cleanupToken) },
    dependencies.fetcher
  );
  return Array.isArray(result) ? result : [];
}

export async function cloudflareResult(pathname, init, fetcher, options = {}) {
  const timeoutMilliseconds = Math.max(1, options.timeoutMilliseconds ?? 30_000);
  const response = await fetcher(`${apiBase}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMilliseconds)
  });
  if (options.allowNotFound && response.status === 404) return null;
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Cloudflare returned invalid JSON for ${init.method ?? "GET"} ${pathname}.`);
  }
  if (!response.ok || body?.success === false) {
    const code = body?.errors?.[0]?.code ?? "unknown";
    throw new Error(
      `Cloudflare rejected ${init.method ?? "GET"} ${pathname} with HTTP ${response.status} (code ${code}).`
    );
  }
  return body?.result;
}

export function cloudflareHeaders(token, json = false) {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {})
  };
}

export function triggerCreateBody(record) {
  return {
    branch_excludes: [],
    branch_includes: [record.branch],
    build_caching_enabled: false,
    build_command: record.buildCommand,
    build_token_uuid: record.buildTokenUuid,
    deploy_command: record.initialDeployCommand,
    external_script_id: record.workerTag,
    path_excludes: [],
    path_includes: record.pathIncludes,
    repo_connection_uuid: record.repoConnectionUuid,
    root_directory: record.rootDirectory,
    trigger_name: record.triggerName
  };
}

export function assertExactTrigger(trigger, record, allowedDeployCommands) {
  if (
    !trigger ||
    !uuidPattern.test(trigger.trigger_uuid ?? "") ||
    trigger.trigger_name !== record.triggerName ||
    trigger.external_script_id !== record.workerTag ||
    trigger.repo_connection?.repo_connection_uuid !== record.repoConnectionUuid ||
    trigger.build_token_uuid !== record.buildTokenUuid ||
    trigger.build_command !== record.buildCommand ||
    !allowedDeployCommands.includes(trigger.deploy_command) ||
    trigger.root_directory !== record.rootDirectory ||
    trigger.build_caching_enabled !== false ||
    JSON.stringify(trigger.branch_includes) !== JSON.stringify([record.branch]) ||
    JSON.stringify(trigger.branch_excludes) !== "[]" ||
    JSON.stringify(trigger.path_includes) !== JSON.stringify(record.pathIncludes) ||
    JSON.stringify(trigger.path_excludes) !== "[]"
  ) {
    throw new Error("Cloudflare returned a Workers Builds trigger that does not match the record.");
  }
}

export function writeCandidateManifestUrl(file, url) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.vars = { ...config.vars, HQBASE_RELEASE_MANIFEST_URL: url };
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

export function readCandidate(context, dependencies) {
  const raw = dependencies.readFile(context.releaseManifestFile, "utf8");
  const envelope = JSON.parse(raw);
  const manifest = JSON.parse(Buffer.from(envelope.payload ?? "", "base64url").toString("utf8"));
  if (
    typeof envelope.signature !== "string" ||
    manifest.version !== context.candidateVersion ||
    manifest.updater?.protocol !== 2 ||
    typeof manifest.updater?.sourceUrl !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.updater?.sha256 ?? "") ||
    !Number.isInteger(manifest.updater?.size) ||
    manifest.updater.size <= 0
  ) {
    throw new Error("The staging gate received an invalid signed candidate manifest.");
  }
  return {
    manifest,
    raw,
    sha256: createHash("sha256").update(raw).digest("hex")
  };
}

export function assertSameGateIdentity(actual, expected) {
  const identity = (gate) => ({
    candidateManifest: {
      name: gate.candidateManifest.name,
      path: gate.candidateManifest.path,
      sha256: gate.candidateManifest.sha256,
      url: gate.candidateManifest.url
    },
    workersBuild: {
      branch: gate.workersBuild.branch,
      buildCommand: gate.workersBuild.buildCommand,
      buildTokenUuid: gate.workersBuild.buildTokenUuid,
      initialDeployCommand: gate.workersBuild.initialDeployCommand,
      pathIncludes: gate.workersBuild.pathIncludes,
      repoConnectionUuid: gate.workersBuild.repoConnectionUuid,
      rootDirectory: gate.workersBuild.rootDirectory,
      triggerName: gate.workersBuild.triggerName,
      workerTag: gate.workersBuild.workerTag
    }
  });
  if (JSON.stringify(identity(actual)) !== JSON.stringify(identity(expected))) {
    throw new Error("The existing release-gate lifecycle record does not match this workflow run.");
  }
}

export function assertReadyGate(gate) {
  if (
    gate?.candidateManifest?.ownership !== "created" ||
    gate?.workersBuild?.ownership !== "created" ||
    !uuidPattern.test(gate.workersBuild.triggerUuid ?? "")
  ) {
    throw new Error("The deployed update-action release gate is not ready.");
  }
}

export function assertDeployment(manifest, context) {
  assertCurrentManifest(manifest);
  if (
    manifest.name !== context.deploymentName ||
    manifest.accountId !== context.accountId ||
    manifest.worker.name !== context.workerName ||
    manifest.worker.deployed !== true
  ) {
    throw new Error("The staging deployment does not match the release-gate environment.");
  }
}

export function commonContext(environment) {
  const deploymentName = required(environment, "DEPLOYMENT_NAME");
  const accountId = required(environment, "CLOUDFLARE_ACCOUNT_ID");
  if (!workerTagPattern.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be 32 hexadecimal characters.");
  }
  const repoConnectionUuid = required(environment, "HQBASE_E2E_REPO_CONNECTION_UUID");
  const buildTokenUuid = required(environment, "HQBASE_E2E_BUILD_TOKEN_UUID");
  for (const [name, value] of [
    ["HQBASE_E2E_REPO_CONNECTION_UUID", repoConnectionUuid],
    ["HQBASE_E2E_BUILD_TOKEN_UUID", buildTokenUuid]
  ]) {
    if (!uuidPattern.test(value)) throw new Error(`${name} must be a UUID.`);
  }
  return {
    accountId,
    buildTokenUuid,
    candidateVersion: required(environment, "CANDIDATE_VERSION"),
    cleanupToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    configFile: environment.HQBASE_STAGING_CONFIG || configPath(deploymentName),
    deploymentName,
    releaseManifestFile:
      environment.HQBASE_RELEASE_MANIFEST_FILE ||
      path.join(repositoryRoot, "release", "stable.json"),
    repoConnectionUuid,
    runAttempt: required(environment, "GITHUB_RUN_ATTEMPT"),
    runId: required(environment, "GITHUB_RUN_ID"),
    workerName: required(environment, "STAGING_WORKER_NAME")
  };
}

export function probeContext(environment) {
  return {
    ...commonContext(environment),
    accessClientId: required(environment, "HQBASE_STAGING_ACCESS_CLIENT_ID"),
    accessClientSecret: required(environment, "HQBASE_STAGING_ACCESS_CLIENT_SECRET"),
    appUrl: canonicalOrigin(required(environment, "HQBASE_STAGING_URL")),
    authSecret: required(environment, "HQBASE_STAGING_AUTH_SECRET"),
    ownerEmail: required(environment, "HQBASE_STAGING_OWNER_EMAIL"),
    ownerPassword: required(environment, "HQBASE_STAGING_OWNER_PASSWORD"),
    updateToken: required(environment, "HQBASE_E2E_UPDATE_API_TOKEN")
  };
}

export function cleanupContext(environment, manifest) {
  const accountId = required(environment, "CLOUDFLARE_ACCOUNT_ID");
  if (accountId !== manifest.accountId) {
    throw new Error("The cleanup account does not match the deployment lifecycle record.");
  }
  return {
    accountId,
    cleanupToken: required(environment, "CLOUDFLARE_API_TOKEN"),
    deploymentName: manifest.name,
    workerName: manifest.worker.name
  };
}

function canonicalOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("HQBASE_STAGING_URL must be a canonical HTTPS origin.");
  }
  return url.origin;
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for the deployed update-action release gate.`);
  return value;
}

export function resolveDependencies(options) {
  return {
    environment: options.environment ?? process.env,
    fetcher: options.fetcher ?? fetch,
    loadManifest: options.loadManifest ?? loadManifest,
    manifestExists: options.manifestExists ?? manifestExists,
    now: options.now ?? Date.now,
    readFile: options.readFile ?? fs.readFileSync,
    runCommand: options.runCommand ?? run,
    sleep:
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
    writeManifest: options.writeManifest ?? writeManifest
  };
}
