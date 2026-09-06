import { writeFileSync } from "node:fs";
import { appRequest, installationSnapshot, requireAppJson } from "./staging-update-gate-app.mjs";
import { cloudflareHeaders, cloudflareResult } from "./staging-update-gate-shared.mjs";

export async function finishPublicUpgrade(manifest, release, before, context, dependencies) {
  const record = manifest.releaseGate.workersBuild;
  let completed = false;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const build = await cloudflareResult(
      `/accounts/${context.accountId}/builds/builds/${record.buildUuid}`,
      { headers: cloudflareHeaders(context.cleanupToken) },
      dependencies.fetcher
    );
    if (build.status === "stopped") {
      if (!Number.isFinite(Date.parse(build.stopped_on)))
        throw new Error("Build stop time is missing.");
      record.buildOutcome = build.build_outcome;
      record.stoppedOn = build.stopped_on;
      dependencies.writeManifest(manifest);
      if (build.build_outcome !== "success")
        throw new Error("The public update build did not succeed.");
      completed = true;
      break;
    }
    await dependencies.sleep(5_000);
  }
  if (!completed) throw new Error("The public update build did not finish within 15 minutes.");
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await appRequest(
      context,
      `/api/health?release=${release.version}&attempt=${attempt}`,
      {},
      dependencies.fetcher
    );
    if (response.ok) {
      const health = await requireAppJson(response, 200, "candidate health");
      if (health.ok === true && health.version === release.version) {
        healthy = true;
        break;
      }
    }
    await dependencies.sleep(2_000);
  }
  if (!healthy) throw new Error("The new Worker did not report the exact candidate version.");
  const after = await installationSnapshot(manifest, context, dependencies);
  if (
    after.workerVersionId === before.workerVersionId ||
    after.d1.installed_version !== release.version ||
    after.d1.installed_schema_version !== release.schemaVersion ||
    after.d1.update_history_count !== before.d1.update_history_count + 1 ||
    after.d1.verified_update_count !== before.d1.verified_update_count + 1 ||
    ["user_count", "mailbox_count", "draft_count", "message_count", "probe"].some(
      (key) => after.d1[key] !== before.d1[key]
    )
  ) {
    throw new Error(
      "The completed update did not preserve data and record the exact installed release."
    );
  }
  const active = await cloudflareResult(
    `/accounts/${context.accountId}/workers/scripts/${context.workerName}/versions/${after.workerVersionId}`,
    { headers: cloudflareHeaders(context.cleanupToken) },
    dependencies.fetcher
  );
  if (
    active?.annotations?.["workers/tag"] !== `hqbase:${release.version}:${release.artifact.sha256}`
  ) {
    throw new Error("The active Worker does not identify the tested archive.");
  }
  const receipt = {
    workflowRunId: String(dependencies.environment.GITHUB_RUN_ID),
    fromVersion: context.sourceVersion,
    fromArtifactSha256: dependencies.environment.SOURCE_ARTIFACT_SHA256,
    toVersion: release.version,
    toArtifactSha256: release.artifact.sha256,
    buildId: record.buildUuid,
    verified: false
  };
  // The workflow seals this only after lifecycle, mail, PWA, backup and restore checks pass.
  const file = dependencies.environment.HQBASE_UPGRADE_RECEIPT;
  if (!file) throw new Error("A public upgrade receipt path is required.");
  (dependencies.writeReceipt ?? writeFileSync)(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
