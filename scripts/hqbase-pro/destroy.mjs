import fs from "node:fs";

import { optionalBoolean, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { deploymentDir, loadManifest } from "./manifest.mjs";
import { reset } from "./reset.mjs";

const scopes = new Set(["worker", "data", "storage", "domain", "all"]);

export function destroy(flags) {
  const name = requireString(flags, "name");
  const scope = requireString(flags, "scope");
  const dryRun = optionalBoolean(flags, "dry-run");
  const yes = optionalBoolean(flags, "yes");

  if (!scopes.has(scope)) {
    throw new Error(`Unknown destroy scope "${scope}". Use worker, data, storage, domain, or all.`);
  }
  if (!yes && !dryRun) {
    throw new Error("Refusing to destroy Cloudflare resources without --yes.");
  }

  const manifest = loadManifest(name);
  if (scope === "domain" || scope === "all") {
    reset({ name, scope: "domain", "dry-run": dryRun });
  }
  if (scope === "worker" || scope === "all") {
    run("pnpm", ["exec", "wrangler", "delete", manifest.worker.name, "--force"], {
      dryRun,
      allowFailure: true
    });
  }
  if (scope === "data" || scope === "all") {
    run("pnpm", ["exec", "wrangler", "d1", "delete", manifest.d1.name, "--skip-confirmation"], {
      dryRun,
      allowFailure: true
    });
  }
  if (scope === "storage" || scope === "all") {
    run("pnpm", ["exec", "wrangler", "r2", "bucket", "delete", manifest.r2.bucket], {
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
