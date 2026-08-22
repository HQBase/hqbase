import { parseD1DatabaseId, run } from "./command.mjs";
import { writeManifest } from "./manifest.mjs";
import { inspectD1, inspectQueue, inspectR2, wrangler } from "./resources.mjs";

export function provisionResources(manifest, options = {}) {
  const checkpoint = options.checkpoint ?? writeManifest;
  const runCommand = options.runCommand ?? run;
  const dryRun = options.dryRun ?? false;

  if (dryRun) {
    const commands = [
      [manifest.d1, ["d1", "create", manifest.d1.name]],
      [manifest.r2, ["r2", "bucket", "create", manifest.r2.bucket]],
      [manifest.queue.primary, ["queues", "create", manifest.queue.primary.name]],
      [manifest.queue.deadLetter, ["queues", "create", manifest.queue.deadLetter.name]]
    ];
    for (const [resource, args] of commands) {
      if (resource.ownership === "unclaimed") {
        wrangler(manifest, args, { dryRun, quiet: false, runCommand });
      }
    }
    return;
  }

  for (const [path, resource] of [
    ["d1", manifest.d1],
    ["r2", manifest.r2],
    ["queue.primary", manifest.queue.primary],
    ["queue.deadLetter", manifest.queue.deadLetter]
  ]) {
    if (resource.ownership === "removed") {
      throw new Error(
        `Refusing to install: manifest resource "${path}" was removed. Start a new deployment name.`
      );
    }
  }

  if (manifest.d1.ownership === "unclaimed") {
    beginCreate(manifest, manifest.d1, checkpoint);
    const output = wrangler(manifest, ["d1", "create", manifest.d1.name], {
      quiet: false,
      runCommand,
      stdoutOnly: false
    });
    const id = parseD1DatabaseId(output);
    inspectD1(manifest, { ...manifest.d1, id, ownership: "created" }, { runCommand });
    manifest.d1.id = id;
    finishCreate(manifest, manifest.d1, checkpoint);
  }

  if (manifest.r2.ownership === "unclaimed") {
    beginCreate(manifest, manifest.r2, checkpoint);
    wrangler(manifest, ["r2", "bucket", "create", manifest.r2.bucket], {
      quiet: false,
      runCommand
    });
    inspectR2(manifest, { ...manifest.r2, ownership: "created" }, { runCommand });
    finishCreate(manifest, manifest.r2, checkpoint);
  }

  for (const queue of [manifest.queue.primary, manifest.queue.deadLetter]) {
    if (queue.ownership !== "unclaimed") {
      continue;
    }
    beginCreate(manifest, queue, checkpoint);
    wrangler(manifest, ["queues", "create", queue.name], { quiet: false, runCommand });
    const identity = inspectQueue(manifest, { ...queue, ownership: "created" }, { runCommand });
    queue.id = identity.id;
    finishCreate(manifest, queue, checkpoint);
  }
}

function beginCreate(manifest, resource, checkpoint) {
  resource.ownership = "creating";
  checkpoint(manifest);
}

function finishCreate(manifest, resource, checkpoint) {
  resource.ownership = "created";
  checkpoint(manifest);
}
