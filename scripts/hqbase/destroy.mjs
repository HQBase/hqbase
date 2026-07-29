import fs from "node:fs";

import { optionalBoolean, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { deploymentDir, loadManifest } from "./manifest.mjs";
import { reset } from "./reset.mjs";

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
    data: targets.data && !manifest.d1.reused,
    storage: targets.storage && !manifest.r2.reused,
    preserved: {
      data: targets.data && manifest.d1.reused,
      storage: targets.storage && manifest.r2.reused
    }
  };
}

export function destroy(flags) {
  const name = requireString(flags, "name");
  const scope = requireString(flags, "scope");
  const dryRun = optionalBoolean(flags, "dry-run");
  const yes = optionalBoolean(flags, "yes");

  if (!yes && !dryRun) {
    throw new Error("Refusing to destroy Cloudflare resources without --yes.");
  }

  const manifest = loadManifest(name);
  const targets = destroyPlan(scope, manifest);
  if (targets.domain) {
    reset({ name, scope: "domain", "dry-run": dryRun });
  }
  if (targets.queues && manifest.queue) {
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "queues",
        "consumer",
        "worker",
        "remove",
        manifest.queue.name,
        manifest.worker.name
      ],
      { dryRun, allowFailure: true }
    );
  }
  if (targets.worker) {
    run("pnpm", ["exec", "wrangler", "delete", manifest.worker.name, "--force"], {
      dryRun,
      allowFailure: true
    });
  }
  if (targets.data) {
    run("pnpm", ["exec", "wrangler", "d1", "delete", manifest.d1.name, "--skip-confirmation"], {
      dryRun
    });
  }
  if (targets.storage) {
    run("pnpm", ["exec", "wrangler", "r2", "bucket", "delete", manifest.r2.bucket], {
      dryRun
    });
  }
  if (targets.preserved.data) {
    console.log(`Preserved reused D1 database "${manifest.d1.name}".`);
  }
  if (targets.preserved.storage) {
    console.log(`Preserved reused R2 bucket "${manifest.r2.bucket}".`);
  }
  if (targets.queues && manifest.queue) {
    run("pnpm", ["exec", "wrangler", "queues", "delete", manifest.queue.name], {
      dryRun
    });
    run("pnpm", ["exec", "wrangler", "queues", "delete", manifest.queue.deadLetterName], {
      dryRun
    });
  }

  if (scope === "all" && !dryRun) {
    fs.rmSync(deploymentDir(name), { recursive: true, force: true });
    console.log(`Removed local manifest for "${name}".`);
  } else {
    console.log(`Kept local manifest for "${name}" because destroy scope was partial.`);
  }
}

function assertDestroyManifest(manifest, targets) {
  if (manifest?.version !== 1 && manifest?.version !== 2) {
    throw new Error(
      `Refusing to destroy: manifest field "version" must be a supported value. Migrate or repair the manifest from verified deployment records before retrying.`
    );
  }

  assertOwnershipFlag(manifest, "d1");
  assertOwnershipFlag(manifest, "r2");
  assertRecordedName(manifest, "name");
  assertRecordedName(manifest, "d1.name");
  assertRecordedName(manifest, "r2.bucket");
  if (targets.worker || targets.queues) {
    assertRecordedName(manifest, "worker.name");
  }
  if (targets.queues) {
    assertRecordedName(manifest, "queue.name");
    assertRecordedName(manifest, "queue.deadLetterName");
  }
  if (targets.domain && manifest.email !== null) {
    assertRecordedName(manifest, "email.domain");
  }
}

function assertOwnershipFlag(manifest, resource) {
  if (typeof manifest?.[resource]?.reused !== "boolean") {
    throw new Error(
      `Refusing to destroy: manifest field "${resource}.reused" must be an explicit boolean. Migrate or repair the manifest from verified deployment records before retrying.`
    );
  }
}

function assertRecordedName(manifest, path) {
  const value = path.split(".").reduce((current, key) => current?.[key], manifest);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Refusing to destroy: manifest field "${path}" must be a non-empty string. Migrate or repair the manifest from verified deployment records before retrying.`
    );
  }
}
