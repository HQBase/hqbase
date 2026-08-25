import fs from "node:fs";

import { optionalBoolean, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { assertCurrentManifest, assertUnambiguousManifest } from "./lifecycle-manifest.mjs";
import { deploymentDir, loadManifest, writeManifest } from "./manifest.mjs";
import { reset } from "./reset.mjs";
import { prepareManifest, resolveCloudflareAccount, wrangler } from "./resources.mjs";

const scopes = new Set(["worker", "data", "storage", "state", "domain", "all"]);

export function destroyTargets(scope) {
  if (!scopes.has(scope)) {
    throw new Error(
      `Unknown destroy scope "${scope}". Use worker, data, storage, state, domain, or all.`
    );
  }

  return {
    domain: scope === "domain" || scope === "all",
    worker: scope === "worker" || scope === "all",
    data: scope === "data" || scope === "state" || scope === "all",
    storage: scope === "storage" || scope === "state" || scope === "all",
    queues: scope === "state" || scope === "all"
  };
}

export function destroyPlan(scope, manifest) {
  const targets = destroyTargets(scope);
  assertDestroyManifest(manifest, targets);

  return {
    ...targets,
    worker: targets.worker && manifest.worker.deployed,
    data: targets.data && manifest.d1.ownership === "created",
    storage: targets.storage && manifest.r2.ownership === "created",
    queueResources: {
      primary: targets.queues && manifest.queue.primary.ownership === "created",
      deadLetter: targets.queues && manifest.queue.deadLetter.ownership === "created"
    },
    preserved: {
      data: targets.data && manifest.d1.ownership === "reused",
      storage: targets.storage && manifest.r2.ownership === "reused",
      primaryQueue: targets.queues && manifest.queue.primary.ownership === "reused",
      deadLetterQueue: targets.queues && manifest.queue.deadLetter.ownership === "reused"
    }
  };
}

export function destroy(flags, options = {}) {
  const name = requireString(flags, "name");
  const scope = requireString(flags, "scope");
  const dryRun = optionalBoolean(flags, "dry-run");
  const yes = optionalBoolean(flags, "yes");
  const runCommand = options.runCommand ?? run;
  const checkpoint = options.checkpoint ?? writeManifest;

  if (!yes && !dryRun) {
    throw new Error("Refusing to destroy Cloudflare resources without --yes.");
  }

  let manifest = loadManifest(name);
  if (dryRun) {
    assertCurrentManifest(manifest);
    assertUnambiguousManifest(manifest);
  } else {
    const accountId = resolveCloudflareAccount(
      manifest.version === 3 ? manifest.accountId : undefined,
      {
        environment: options.environment ?? process.env,
        runCommand
      }
    );
    manifest = prepareManifest(manifest, accountId, { checkpoint, runCommand });
  }

  let targets = destroyPlan(scope, manifest);
  if (targets.domain) {
    reset({ name, scope: "domain", "dry-run": dryRun });
    if (!dryRun) {
      manifest = loadManifest(name);
      targets = destroyPlan(scope, manifest);
    }
  }
  destroyResources(scope, manifest, { checkpoint, dryRun, runCommand });

  if (scope === "all" && !dryRun) {
    fs.rmSync(deploymentDir(name), { recursive: true, force: true });
    console.log(`Removed local manifest for "${name}".`);
  } else {
    console.log(`Kept local manifest for "${name}" because destroy scope was partial.`);
  }
}

export function destroyResources(scope, manifest, options = {}) {
  const checkpoint = options.checkpoint ?? writeManifest;
  const dryRun = options.dryRun ?? false;
  const emptyBucket = options.emptyBucket ?? emptyRecordedR2Bucket;
  const runCommand = options.runCommand ?? run;
  const targets = destroyPlan(scope, manifest);

  if (targets.worker || targets.queueResources.primary) {
    wrangler(
      manifest,
      ["queues", "consumer", "worker", "remove", manifest.queue.primary.name, manifest.worker.name],
      { allowFailure: true, dryRun, quiet: false, runCommand }
    );
  }

  if (targets.worker) {
    wrangler(manifest, ["delete", manifest.worker.name, "--force"], {
      dryRun,
      quiet: false,
      runCommand
    });
    manifest.worker.deployed = false;
    checkpoint(manifest, { dryRun });
  }
  for (const [selected, queue] of [
    [targets.queueResources.primary, manifest.queue.primary],
    [targets.queueResources.deadLetter, manifest.queue.deadLetter]
  ]) {
    if (!selected) {
      continue;
    }
    wrangler(manifest, ["queues", "delete", queue.name], {
      dryRun,
      quiet: false,
      runCommand
    });
    queue.ownership = "removed";
    checkpoint(manifest, { dryRun });
  }

  if (targets.storage) {
    emptyBucket(manifest, { dryRun, runCommand });
    wrangler(manifest, ["r2", "bucket", "delete", manifest.r2.bucket], {
      dryRun,
      quiet: false,
      runCommand
    });
    manifest.r2.ownership = "removed";
    checkpoint(manifest, { dryRun });
  }
  if (targets.data) {
    wrangler(manifest, ["d1", "delete", manifest.d1.id, "--skip-confirmation"], {
      dryRun,
      quiet: false,
      runCommand
    });
    manifest.d1.ownership = "removed";
    checkpoint(manifest, { dryRun });
  }
  if (targets.preserved.data) {
    console.log(`Preserved reused D1 database "${manifest.d1.name}".`);
  }
  if (targets.preserved.storage) {
    console.log(`Preserved reused R2 bucket "${manifest.r2.bucket}".`);
  }
  if (targets.preserved.primaryQueue) {
    console.log(`Preserved reused queue "${manifest.queue.primary.name}".`);
  }
  if (targets.preserved.deadLetterQueue) {
    console.log(`Preserved reused queue "${manifest.queue.deadLetter.name}".`);
  }

  return targets;
}

export function emptyRecordedR2Bucket(manifest, options = {}) {
  const runCommand = options.runCommand ?? run;
  return runCommand(
    "node",
    ["scripts/hqbase/empty-r2.mjs", manifest.accountId, manifest.r2.bucket],
    {
      dryRun: options.dryRun,
      quiet: false,
      env: { CLOUDFLARE_ACCOUNT_ID: manifest.accountId }
    }
  );
}

function assertDestroyManifest(manifest, targets) {
  assertCurrentManifest(manifest);
  assertUnambiguousManifest(manifest);
  if (targets.domain && manifest.email !== null) {
    const domain = manifest.email?.domain;
    if (typeof domain !== "string" || domain.trim() === "") {
      throw new Error(
        'Refusing to destroy: manifest field "email.domain" must be a non-empty string.'
      );
    }
  }
}
