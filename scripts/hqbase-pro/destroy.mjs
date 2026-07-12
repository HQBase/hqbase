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

export function destroy(flags) {
  const name = requireString(flags, "name");
  const scope = requireString(flags, "scope");
  const dryRun = optionalBoolean(flags, "dry-run");
  const yes = optionalBoolean(flags, "yes");

  const targets = destroyTargets(scope);
  if (!yes && !dryRun) {
    throw new Error("Refusing to destroy Cloudflare resources without --yes.");
  }

  const manifest = loadManifest(name);
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
      dryRun,
      allowFailure: true
    });
  }
  if (targets.storage) {
    run("pnpm", ["exec", "wrangler", "r2", "bucket", "delete", manifest.r2.bucket], {
      dryRun,
      allowFailure: true
    });
  }
  if (targets.queues && manifest.queue) {
    run("pnpm", ["exec", "wrangler", "queues", "delete", manifest.queue.name], {
      dryRun,
      allowFailure: true
    });
    run("pnpm", ["exec", "wrangler", "queues", "delete", manifest.queue.deadLetterName], {
      dryRun,
      allowFailure: true
    });
  }

  if (scope === "all" && !dryRun) {
    fs.rmSync(deploymentDir(name), { recursive: true, force: true });
    console.log(`Removed local manifest for "${name}".`);
  } else {
    console.log(`Kept local manifest for "${name}" because destroy scope was partial.`);
  }
}
