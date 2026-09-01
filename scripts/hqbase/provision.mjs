import { parseD1DatabaseId, run } from "./command.mjs";
import { writeManifest } from "./manifest.mjs";
import { inspectD1, inspectQueue, inspectR2, wrangler } from "./resources.mjs";

const postCreateReadDelaysMs = [1_000, 2_000, 4_000, 8_000, 15_000];

export function provisionResources(manifest, options = {}) {
  const checkpoint = options.checkpoint ?? writeManifest;
  const runCommand = options.runCommand ?? run;
  const dryRun = options.dryRun ?? false;
  const verification = {
    delaysMs: options.postCreateReadDelaysMs,
    sleep: options.sleep
  };

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
    verifyCreatedResource(
      `D1 database "${manifest.d1.name}"`,
      () => inspectD1(manifest, { ...manifest.d1, id, ownership: "created" }, { runCommand }),
      verification
    );
    manifest.d1.id = id;
    finishCreate(manifest, manifest.d1, checkpoint);
  }

  if (manifest.r2.ownership === "unclaimed") {
    beginCreate(manifest, manifest.r2, checkpoint);
    wrangler(manifest, ["r2", "bucket", "create", manifest.r2.bucket], {
      quiet: false,
      runCommand
    });
    verifyCreatedResource(
      `R2 bucket "${manifest.r2.bucket}"`,
      () => inspectR2(manifest, { ...manifest.r2, ownership: "created" }, { runCommand }),
      verification
    );
    finishCreate(manifest, manifest.r2, checkpoint);
  }

  for (const queue of [manifest.queue.primary, manifest.queue.deadLetter]) {
    if (queue.ownership !== "unclaimed") {
      continue;
    }
    beginCreate(manifest, queue, checkpoint);
    wrangler(manifest, ["queues", "create", queue.name], { quiet: false, runCommand });
    const identity = verifyCreatedResource(
      `Queue "${queue.name}"`,
      () => inspectQueue(manifest, { ...queue, ownership: "created" }, { runCommand }),
      verification
    );
    queue.id = identity.id;
    finishCreate(manifest, queue, checkpoint);
  }
}

function verifyCreatedResource(label, inspect, options = {}) {
  const delaysMs = options.delaysMs ?? postCreateReadDelaysMs;
  const sleep = options.sleep ?? sleepSync;
  let lastError;

  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return inspect();
    } catch (error) {
      lastError = error;
      if (attempt < delaysMs.length) {
        sleep(delaysMs[attempt]);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const delaySeconds = delaysMs.reduce((total, delayMs) => total + delayMs, 0) / 1_000;
  throw new Error(
    `Cloudflare accepted creation of ${label}, but HQBase could not verify its identity after ${delaysMs.length + 1} checks and ${delaySeconds} seconds of retry delays. The deployment record remains in the unfinished "creating" state. Verify the Cloudflare resource before retrying. Last check: ${detail}`,
    { cause: lastError }
  );
}

function sleepSync(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function beginCreate(manifest, resource, checkpoint) {
  resource.ownership = "creating";
  checkpoint(manifest);
}

function finishCreate(manifest, resource, checkpoint) {
  resource.ownership = "created";
  checkpoint(manifest);
}
