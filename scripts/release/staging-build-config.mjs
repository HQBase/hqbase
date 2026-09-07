import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createWranglerConfig } from "../hqbase/config.mjs";
import { assertCurrentManifest } from "../hqbase/lifecycle-manifest.mjs";
import { cloudflareHeaders, cloudflareResult } from "./staging-update-gate-shared.mjs";

export const publicConfigVariable = "HQBASE_STAGING_BUILD_CONFIG";

export async function configurePublicBuild(manifest, context, dependencies) {
  if (!context.publicUpgrade) return;
  await cloudflareResult(
    `/accounts/${context.accountId}/builds/triggers/${manifest.releaseGate.workersBuild.triggerUuid}/environment_variables`,
    {
      method: "PATCH",
      headers: cloudflareHeaders(context.cleanupToken, true),
      body: JSON.stringify({
        [publicConfigVariable]: { is_secret: false, value: publicBuildConfiguration(manifest) }
      })
    },
    dependencies.fetcher
  );
}

export function configuredBuildRecord(manifest, context, variables) {
  const record = manifest.releaseGate.workersBuild;
  if (!context.publicUpgrade) return record;
  const expected = publicBuildConfiguration(manifest);
  const variable = variables?.[publicConfigVariable];
  if (variable?.is_secret !== false || variable.value !== expected) {
    throw new Error("The accepted build did not keep its disposable resource configuration.");
  }
  return { ...record, publicBuildConfiguration: expected };
}

function assertPublicResources(manifest) {
  assertCurrentManifest(manifest);
  const name = manifest.worker.name;
  if (
    !/^hqbase-public-\d+-(inbound|outbound)$/.test(name) ||
    manifest.name !== name.slice("hqbase-".length) ||
    manifest.worker.deployed !== true ||
    manifest.d1.name !== name ||
    manifest.r2.bucket !== `${name}-mail` ||
    manifest.queue.primary.name !== `${name}-jobs` ||
    manifest.queue.deadLetter.name !== `${name}-jobs-dlq` ||
    [manifest.d1, manifest.r2, manifest.queue.primary, manifest.queue.deadLetter].some(
      (resource) => resource.ownership !== "created"
    )
  ) {
    throw new Error("Public upgrade builds require their recorded disposable resources.");
  }
}

export function publicBuildConfiguration(manifest) {
  assertPublicResources(manifest);
  const pick = (value, fields) =>
    Object.fromEntries(
      fields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])
    );
  const resourceFields = ["id", "name", "ownership"];
  return JSON.stringify({
    manifest: {
      ...pick(manifest, ["version", "name", "accountId", "appDomain", "authUrl"]),
      worker: pick(manifest.worker, ["name", "deployed"]),
      d1: pick(manifest.d1, resourceFields),
      r2: pick(manifest.r2, ["bucket", "ownership"]),
      queue: {
        primary: pick(manifest.queue.primary, resourceFields),
        deadLetter: pick(manifest.queue.deadLetter, resourceFields)
      },
      ...(manifest.cloudflareOAuth
        ? { cloudflareOAuth: pick(manifest.cloudflareOAuth, ["mode", "clientId"]) }
        : {})
    },
    workerTag: manifest.releaseGate.workersBuild.workerTag,
    manifestUrl: manifest.releaseGate.candidateManifest.url
  });
}

export function writePublicBuildConfiguration(environment = process.env, write = writeFileSync) {
  const payload = JSON.parse(environment[publicConfigVariable] ?? "null");
  if (!payload?.manifest) throw new Error("The public upgrade build configuration is missing.");
  assertPublicResources(payload.manifest);
  if (
    !/^[a-f0-9]{32}$/.test(payload.workerTag ?? "") ||
    payload.workerTag !== environment.WRANGLER_CI_MATCH_TAG ||
    payload.manifest.worker.name !== environment.WRANGLER_CI_OVERRIDE_NAME
  ) {
    throw new Error("The public upgrade configuration does not match this Cloudflare build.");
  }
  const url = new URL(payload.manifestUrl);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".workers.dev") ||
    url.search ||
    url.hash
  ) {
    throw new Error("The public upgrade discovery fixture URL is invalid.");
  }
  const config = createWranglerConfig(payload.manifest);
  config.vars.HQBASE_RELEASE_MANIFEST_URL = payload.manifestUrl;
  write(resolve("wrangler.jsonc"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writePublicBuildConfiguration();
}
