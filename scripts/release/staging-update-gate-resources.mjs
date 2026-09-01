import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertExactTrigger,
  branch,
  cloudflareHeaders,
  cloudflareResult,
  initialDeployCommand,
  listTriggers,
  listWorkers,
  managedCommand,
  managedUpdaterLoader,
  repositoryRoot,
  terminalOutcomes,
  triggerCreateBody,
  uuidPattern,
  workerTagPattern
} from "./staging-update-gate-shared.mjs";

export async function ensureCandidateManifestWorker(manifest, body, context, dependencies) {
  const record = manifest.releaseGate.candidateManifest;
  const existing = (await listWorkers(context, dependencies)).find(
    (item) => item.id === record.name
  );
  if (existing) {
    if (record.workerTag && existing.tag !== record.workerTag) {
      throw new Error("The candidate-manifest Worker tag does not match its lifecycle record.");
    }
    await verifyCandidateResponse(record, body, dependencies);
    record.workerTag = existing.tag;
    record.ownership = "created";
    dependencies.writeManifest(manifest);
    return;
  }

  record.ownership = "creating";
  dependencies.writeManifest(manifest);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hqbase-release-gate-"));
  try {
    const sourceFile = path.join(temporary, "worker.mjs");
    const configFile = path.join(temporary, "wrangler.jsonc");
    fs.writeFileSync(
      sourceFile,
      `const body=${JSON.stringify(body)};const pathname=${JSON.stringify(record.path)};export default{fetch(request){const url=new URL(request.url);if(request.method!=="GET"||url.pathname!==pathname)return new Response(null,{status:404});return new Response(body,{headers:{"cache-control":"no-store","content-type":"application/json"}})}};\n`
    );
    fs.writeFileSync(
      configFile,
      `${JSON.stringify(
        {
          compatibility_date: "2025-01-01",
          main: "worker.mjs",
          name: record.name,
          preview_urls: false,
          workers_dev: true
        },
        null,
        2
      )}\n`
    );
    dependencies.runCommand(
      "pnpm",
      ["exec", "wrangler", "deploy", "--config", configFile],
      repositoryRoot
    );
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
  await verifyCandidateResponse(record, body, dependencies);
  const created = (await listWorkers(context, dependencies)).find(
    (item) => item.id === record.name
  );
  if (!workerTagPattern.test(created?.tag ?? "")) {
    throw new Error("Cloudflare did not confirm the candidate-manifest Worker identity.");
  }
  record.workerTag = created.tag;
  record.ownership = "created";
  dependencies.writeManifest(manifest);
}

async function verifyCandidateResponse(record, body, dependencies) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await dependencies.fetcher(record.url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000)
      });
      if (response.ok && (await response.text()) === body) return;
    } catch {
      // A new workers.dev route can need a short propagation period.
    }
    await dependencies.sleep(1_000);
  }
  throw new Error("The candidate-manifest Worker did not serve the exact signed envelope.");
}

export async function ensureBuildTrigger(manifest, context, dependencies) {
  const record = manifest.releaseGate.workersBuild;
  const triggers = await listTriggers(record.workerTag, context, dependencies);
  const matches = triggers.filter((trigger) => trigger.trigger_name === record.triggerName);
  if (
    matches.length > 1 ||
    triggers.some((trigger) => trigger.trigger_name !== record.triggerName)
  ) {
    throw new Error("The disposable staging Worker has an unexpected Workers Builds trigger.");
  }
  if (matches.length === 1) {
    assertExactTrigger(matches[0], record, [initialDeployCommand]);
    record.triggerUuid = matches[0].trigger_uuid;
    record.ownership = "created";
    dependencies.writeManifest(manifest);
    return;
  }

  record.ownership = "creating";
  dependencies.writeManifest(manifest);
  const created = await cloudflareResult(
    `/accounts/${context.accountId}/builds/triggers`,
    {
      body: JSON.stringify(triggerCreateBody(record)),
      headers: cloudflareHeaders(context.cleanupToken, true),
      method: "POST"
    },
    dependencies.fetcher
  );
  assertExactTrigger(created, record, [initialDeployCommand]);
  record.triggerUuid = created.trigger_uuid;
  record.ownership = "created";
  dependencies.writeManifest(manifest);
}

export async function verifyAcceptedBuild(manifest, release, context, dependencies) {
  const record = manifest.releaseGate.workersBuild;
  const triggers = await listTriggers(record.workerTag, context, dependencies);
  const trigger = triggers.find((item) => item.trigger_uuid === record.triggerUuid);
  assertExactTrigger(trigger, record, [managedCommand]);
  const variables = await cloudflareResult(
    `/accounts/${context.accountId}/builds/triggers/${record.triggerUuid}/environment_variables`,
    { headers: cloudflareHeaders(context.cleanupToken) },
    dependencies.fetcher
  );
  if (
    variables?.HQBASE_UPDATER_LOADER?.is_secret !== false ||
    variables.HQBASE_UPDATER_LOADER.value !== managedUpdaterLoader(release.updater) ||
    variables?.HQBASE_EXPECTED_RELEASE_VERSION?.is_secret !== false ||
    variables.HQBASE_EXPECTED_RELEASE_VERSION.value !== context.candidateVersion ||
    variables?.HQBASE_FORCE_SOURCE_DEPLOY !== undefined
  ) {
    throw new Error("The accepted build did not keep the exact signed updater variables.");
  }
  await waitForAcceptedBuildConfiguration(record, release, context, dependencies);
}

async function waitForAcceptedBuildConfiguration(record, release, context, dependencies) {
  const deadline = dependencies.now() + 60_000;
  let mismatches = ["build_record"];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const remaining = deadline - dependencies.now();
    if (remaining <= 0) break;
    const build = await cloudflareResult(
      `/accounts/${context.accountId}/builds/builds/${record.buildUuid}`,
      { headers: cloudflareHeaders(context.cleanupToken) },
      dependencies.fetcher,
      { allowNotFound: true, timeoutMilliseconds: Math.min(30_000, remaining) }
    );
    if (build) {
      mismatches = acceptedBuildMismatches(build, record, release, context);
      if (mismatches.length === 0) return build;
      if (build.status === "stopped") break;
    }
    const sleepMilliseconds = Math.min(1_000, deadline - dependencies.now());
    if (sleepMilliseconds <= 0) break;
    await dependencies.sleep(sleepMilliseconds);
  }
  throw new Error(
    `Cloudflare did not record the exact release-gate build configuration. Mismatched fields: ${mismatches.join(", ")}.`
  );
}

function acceptedBuildMismatches(build, record, release, context) {
  const metadata = build.build_trigger_metadata ?? {};
  const expected = {
    HQBASE_EXPECTED_RELEASE_VERSION: context.candidateVersion,
    HQBASE_UPDATER_LOADER: managedUpdaterLoader(release.updater),
    branch,
    build_command: record.buildCommand,
    build_token_uuid: record.buildTokenUuid,
    deploy_command: managedCommand,
    root_directory: record.rootDirectory,
    trigger_uuid: record.triggerUuid
  };
  return [
    ...(build.build_uuid === record.buildUuid ? [] : ["build_uuid"]),
    ...(build.trigger?.trigger_uuid === expected.trigger_uuid ? [] : ["trigger_uuid"]),
    ...(metadata.branch === expected.branch ? [] : ["branch"]),
    ...(["api", "manual"].includes(metadata.build_trigger_source) ? [] : ["build_trigger_source"]),
    ...(metadata.build_command === expected.build_command ? [] : ["build_command"]),
    ...(metadata.deploy_command === expected.deploy_command ? [] : ["deploy_command"]),
    ...(metadata.environment_variables?.HQBASE_UPDATER_LOADER === expected.HQBASE_UPDATER_LOADER
      ? []
      : ["HQBASE_UPDATER_LOADER"]),
    ...(metadata.environment_variables?.HQBASE_EXPECTED_RELEASE_VERSION ===
    expected.HQBASE_EXPECTED_RELEASE_VERSION
      ? []
      : ["HQBASE_EXPECTED_RELEASE_VERSION"]),
    ...(metadata.environment_variables?.HQBASE_FORCE_SOURCE_DEPLOY === undefined
      ? []
      : ["HQBASE_FORCE_SOURCE_DEPLOY"]),
    ...(metadata.build_token_uuid === expected.build_token_uuid ? [] : ["build_token_uuid"]),
    ...(metadata.root_directory === expected.root_directory ? [] : ["root_directory"])
  ];
}

export async function reconcileAndCancelBuild(manifest, context, dependencies) {
  const record = manifest.releaseGate.workersBuild;
  if (!record.buildUuid && record.dispatchStartedAt && record.triggerUuid) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await cloudflareResult(
        `/accounts/${context.accountId}/builds/workers/${record.workerTag}/builds`,
        { headers: cloudflareHeaders(context.cleanupToken) },
        dependencies.fetcher
      );
      const builds = Array.isArray(result) ? result : Object.values(result?.builds ?? {});
      const earliest = Date.parse(record.dispatchStartedAt) - 5_000;
      const matches = builds.filter((build) => {
        const source = build.build_trigger_metadata?.build_trigger_source;
        return (
          build.trigger?.trigger_uuid === record.triggerUuid &&
          build.build_trigger_metadata?.branch === branch &&
          ["api", "manual"].includes(source) &&
          Number.isFinite(Date.parse(build.created_on ?? "")) &&
          Date.parse(build.created_on) >= earliest
        );
      });
      if (matches.length > 1) {
        throw new Error("Cloudflare returned more than one build for the recorded gate dispatch.");
      }
      if (matches.length === 1) {
        if (!uuidPattern.test(matches[0].build_uuid ?? "")) {
          throw new Error("Cloudflare returned an invalid build identity during reconciliation.");
        }
        record.buildUuid = matches[0].build_uuid;
        dependencies.writeManifest(manifest);
        break;
      }
      await dependencies.sleep(1_000);
    }
  }
  if (record.buildUuid && !record.buildOutcome) {
    await cancelRecordedBuild(manifest, context, dependencies);
  }
}

export async function cancelRecordedBuild(manifest, context, dependencies) {
  const record = manifest.releaseGate.workersBuild;
  let build = await waitForBuild(record.buildUuid, context, dependencies);
  if (build.status !== "stopped") {
    await cloudflareResult(
      `/accounts/${context.accountId}/builds/builds/${record.buildUuid}/cancel`,
      { headers: cloudflareHeaders(context.cleanupToken), method: "PUT" },
      dependencies.fetcher
    );
    build = await waitForBuild(record.buildUuid, context, dependencies, true);
  }
  if (
    build.status !== "stopped" ||
    !terminalOutcomes.has(build.build_outcome) ||
    !Number.isFinite(Date.parse(build.stopped_on ?? ""))
  ) {
    throw new Error("The release-gate build did not stop with a verified cancellation outcome.");
  }
  record.buildOutcome = build.build_outcome;
  record.stoppedOn = build.stopped_on;
  dependencies.writeManifest(manifest);
}

async function waitForBuild(buildUuid, context, dependencies, requireStopped = false) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await cloudflareResult(
      `/accounts/${context.accountId}/builds/builds/${buildUuid}`,
      { headers: cloudflareHeaders(context.cleanupToken) },
      dependencies.fetcher,
      { allowNotFound: true }
    );
    if (result && (!requireStopped || result.status === "stopped")) return result;
    await dependencies.sleep(1_000);
  }
  throw new Error("Cloudflare did not return the release-gate build in time.");
}

export async function removeBuildTrigger(manifest, context, dependencies) {
  const record = manifest.releaseGate.workersBuild;
  if (record.ownership === "removed") return;
  const triggers = await listTriggers(record.workerTag, context, dependencies);
  const named = triggers.filter((trigger) => trigger.trigger_name === record.triggerName);
  const exact = record.triggerUuid
    ? triggers.find((trigger) => trigger.trigger_uuid === record.triggerUuid)
    : named[0];
  if (!exact) {
    if (named.length > 0) {
      throw new Error("The release-gate trigger name now belongs to a different trigger UUID.");
    }
    record.ownership = "removed";
    dependencies.writeManifest(manifest);
    return;
  }
  if (named.length !== 1) {
    throw new Error("Cloudflare returned an ambiguous release-gate trigger identity.");
  }
  assertExactTrigger(exact, record, [initialDeployCommand, managedCommand]);
  if (!record.triggerUuid) {
    record.triggerUuid = exact.trigger_uuid;
    record.ownership = "created";
    dependencies.writeManifest(manifest);
  }
  await cloudflareResult(
    `/accounts/${context.accountId}/builds/triggers/${record.triggerUuid}`,
    { headers: cloudflareHeaders(context.cleanupToken), method: "DELETE" },
    dependencies.fetcher
  );
  const remaining = await listTriggers(record.workerTag, context, dependencies);
  if (
    remaining.some(
      (trigger) =>
        trigger.trigger_uuid === record.triggerUuid || trigger.trigger_name === record.triggerName
    )
  ) {
    throw new Error("Cloudflare still reports the exact release-gate trigger after deletion.");
  }
  record.ownership = "removed";
  dependencies.writeManifest(manifest);
}

export async function removeCandidateManifestWorker(manifest, context, dependencies) {
  const record = manifest.releaseGate.candidateManifest;
  if (record.ownership === "removed") return;
  let current = (await listWorkers(context, dependencies)).find((item) => item.id === record.name);
  if (!current) {
    record.ownership = "removed";
    dependencies.writeManifest(manifest);
    return;
  }
  if (record.workerTag && current.tag !== record.workerTag) {
    throw new Error("The candidate-manifest Worker name now belongs to a different Worker tag.");
  }
  if (!record.workerTag) {
    if (!workerTagPattern.test(current.tag ?? "")) {
      throw new Error("Cloudflare returned an invalid candidate-manifest Worker tag.");
    }
    record.workerTag = current.tag;
    dependencies.writeManifest(manifest);
  }
  await cloudflareResult(
    `/accounts/${context.accountId}/workers/scripts/${encodeURIComponent(record.name)}`,
    { headers: cloudflareHeaders(context.cleanupToken), method: "DELETE" },
    dependencies.fetcher
  );
  current = (await listWorkers(context, dependencies)).find((item) => item.id === record.name);
  if (current) {
    throw new Error("Cloudflare still reports the exact candidate-manifest Worker after deletion.");
  }
  record.ownership = "removed";
  dependencies.writeManifest(manifest);
}
