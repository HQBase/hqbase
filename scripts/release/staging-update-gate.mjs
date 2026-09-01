import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assertCurrentManifest } from "../hqbase/lifecycle-manifest.mjs";
import {
  appErrorCode,
  appRequest,
  installationSnapshot,
  parseJson,
  requireAppJson,
  setCookieValues,
  signIn,
  verifyUpdateTokenActive
} from "./staging-update-gate-app.mjs";
import {
  cancelRecordedBuild,
  ensureBuildTrigger,
  ensureCandidateManifestWorker,
  reconcileAndCancelBuild,
  removeBuildTrigger,
  removeCandidateManifestWorker,
  verifyAcceptedBuild
} from "./staging-update-gate-resources.mjs";
import {
  assertDeployment,
  assertReadyGate,
  assertSameGateIdentity,
  branch,
  cleanupContext,
  cloudflareHeaders,
  cloudflareResult,
  commonContext,
  createRuntimeGrantCookie,
  gatePath,
  initialBuildCommand,
  initialDeployCommand,
  listWorkers,
  managedUpdaterLoader,
  probeContext,
  readCandidate,
  resolveDependencies,
  uuidPattern,
  workerTagPattern,
  writeCandidateManifestUrl
} from "./staging-update-gate-shared.mjs";

export { createRuntimeGrantCookie, managedUpdaterLoader };

export async function prepareStagingUpdateGate(options = {}) {
  const dependencies = resolveDependencies(options);
  const context = commonContext(dependencies.environment);
  const manifest = dependencies.loadManifest(context.deploymentName);
  assertDeployment(manifest, context);
  const candidate = readCandidate(context, dependencies);
  const headers = cloudflareHeaders(context.cleanupToken);
  const subdomain = await cloudflareResult(
    `/accounts/${context.accountId}/workers/subdomain`,
    { headers },
    dependencies.fetcher
  );
  if (typeof subdomain?.subdomain !== "string" || subdomain.subdomain.trim() === "") {
    throw new Error("Cloudflare did not return the staging workers.dev subdomain.");
  }
  const scripts = await listWorkers(context, dependencies);
  const productionWorker = scripts.find((item) => item.id === context.workerName);
  if (!workerTagPattern.test(productionWorker?.tag ?? "")) {
    throw new Error("Cloudflare did not return the staging Worker's immutable tag.");
  }
  const fixtureName = `hqbase-release-manifest-${context.runId}-${context.runAttempt}`;
  const fixturePath = `/candidate-${createHash("sha256")
    .update(`${context.runId}:${context.runAttempt}:${context.candidateVersion}`)
    .digest("hex")
    .slice(0, 24)}.json`;
  const fixtureUrl = `https://${fixtureName}.${subdomain.subdomain}.workers.dev${fixturePath}`;
  const triggerName = `hqbase-release-gate-${context.runId}-${context.runAttempt}`;
  const expectedGate = {
    candidateManifest: {
      name: fixtureName,
      ownership: "creating",
      path: fixturePath,
      sha256: candidate.sha256,
      url: fixtureUrl,
      workerTag: null
    },
    workersBuild: {
      branch,
      buildCommand: initialBuildCommand,
      buildOutcome: null,
      buildTokenUuid: context.buildTokenUuid,
      buildUuid: null,
      dispatchStartedAt: null,
      initialDeployCommand,
      ownership: "unclaimed",
      pathIncludes: [gatePath],
      repoConnectionUuid: context.repoConnectionUuid,
      rootDirectory: "/",
      stoppedOn: null,
      triggerName,
      triggerUuid: null,
      workerTag: productionWorker.tag
    }
  };

  if (manifest.releaseGate) {
    assertSameGateIdentity(manifest.releaseGate, expectedGate);
  } else {
    if (scripts.some((item) => item.id === fixtureName)) {
      throw new Error(
        "The candidate-manifest Worker exists without this run's lifecycle record. Refusing to adopt or overwrite it."
      );
    }
    manifest.releaseGate = expectedGate;
    dependencies.writeManifest(manifest);
  }

  await ensureCandidateManifestWorker(manifest, candidate.raw, context, dependencies);
  writeCandidateManifestUrl(context.configFile, manifest.releaseGate.candidateManifest.url);
  await ensureBuildTrigger(manifest, context, dependencies);
  console.log("The deployed update-action release gate is ready.");
}

export async function probeStagingUpdateGate(options = {}) {
  const dependencies = resolveDependencies(options);
  const context = probeContext(dependencies.environment);
  const manifest = dependencies.loadManifest(context.deploymentName);
  assertDeployment(manifest, context);
  assertReadyGate(manifest.releaseGate);
  const candidate = readCandidate(context, dependencies);
  const sessionCookies = await signIn(context, dependencies.fetcher);
  const grantCookie = createRuntimeGrantCookie(context.updateToken, context.authSecret);
  const cookies = [...sessionCookies, grantCookie].join("; ");
  const before = await installationSnapshot(manifest, context, dependencies);
  const statusResponse = await appRequest(
    context,
    "/api/updates",
    { headers: { cookie: cookies } },
    dependencies.fetcher
  );
  const status = await requireAppJson(statusResponse, 200, "update status");
  if (
    status.installedVersion !== context.candidateVersion ||
    status.release?.version !== context.candidateVersion ||
    status.available !== true ||
    status.compatible !== true ||
    status.repairRequired !== true
  ) {
    throw new Error("The deployed candidate did not report the expected same-version repair.");
  }

  manifest.releaseGate.workersBuild.dispatchStartedAt = new Date().toISOString();
  dependencies.writeManifest(manifest);
  let applyResponse;
  try {
    applyResponse = await appRequest(
      context,
      "/api/updates/apply",
      {
        body: JSON.stringify({ expectedVersion: context.candidateVersion }),
        headers: { "content-type": "application/json", cookie: cookies },
        method: "POST"
      },
      dependencies.fetcher
    );
  } catch (error) {
    await reconcileAndCancelBuild(manifest, context, dependencies);
    throw error;
  }
  if (applyResponse.status !== 202) {
    const code = await appErrorCode(applyResponse);
    await reconcileAndCancelBuild(manifest, context, dependencies);
    throw new Error(`The deployed update action returned HTTP ${applyResponse.status} (${code}).`);
  }
  const grantClear = setCookieValues(applyResponse.headers).find((value) =>
    value.startsWith("hqb_cf_oauth_grant=")
  );
  if (!grantClear || !/Max-Age=0(?:;|$)/i.test(grantClear)) {
    await reconcileAndCancelBuild(manifest, context, dependencies);
    throw new Error("The deployed update action did not clear its temporary Cloudflare grant.");
  }
  const applied = await parseJson(applyResponse, "update action");
  if (!uuidPattern.test(applied?.buildId ?? "")) {
    await reconcileAndCancelBuild(manifest, context, dependencies);
    throw new Error("The deployed update action did not return a real Workers Build UUID.");
  }
  manifest.releaseGate.workersBuild.buildUuid = applied.buildId;
  dependencies.writeManifest(manifest);

  let verificationError;
  try {
    await verifyUpdateTokenActive(context, dependencies);
    if (applied.status !== "queued") {
      throw new Error('The deployed update action did not report the accepted build as "queued".');
    }
    await verifyAcceptedBuild(manifest, candidate.manifest, context, dependencies);
  } catch (error) {
    verificationError = error;
  }
  await cancelRecordedBuild(manifest, context, dependencies);
  const after = await installationSnapshot(manifest, context, dependencies);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      "The accepted-and-cancelled update action changed the active Worker or D1 state."
    );
  }
  if (verificationError) throw verificationError;
  console.log("The deployed update action accepted and cancelled the exact candidate build.");
}

export async function cleanupStagingUpdateGate(options = {}) {
  const dependencies = resolveDependencies(options);
  const deploymentName = required(dependencies.environment, "DEPLOYMENT_NAME");
  if (!dependencies.manifestExists(deploymentName)) return;
  const manifest = dependencies.loadManifest(deploymentName);
  assertCurrentManifest(manifest);
  if (!manifest.releaseGate) return;
  const context = cleanupContext(dependencies.environment, manifest);
  const errors = [];
  try {
    await reconcileAndCancelBuild(manifest, context, dependencies);
  } catch (error) {
    errors.push(error);
  }
  try {
    await removeBuildTrigger(manifest, context, dependencies);
  } catch (error) {
    errors.push(error);
  }
  try {
    await removeCandidateManifestWorker(manifest, context, dependencies);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "The release-gate cleanup did not reconcile every resource.");
  }
  console.log("The deployed update-action release gate is reconciled.");
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for the deployed update-action release gate.`);
  return value;
}

async function main() {
  const command = process.argv[2];
  if (command === "prepare") return prepareStagingUpdateGate();
  if (command === "probe") return probeStagingUpdateGate();
  if (command === "cleanup") return cleanupStagingUpdateGate();
  throw new Error("Usage: node scripts/release/staging-update-gate.mjs <prepare|probe|cleanup>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "The staging update gate failed.");
    process.exitCode = 1;
  });
}
