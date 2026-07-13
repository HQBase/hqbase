import { optionalBoolean, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import { configPath, loadManifest, writeManifest } from "./manifest.mjs";
import { rootPath } from "./paths.mjs";

const scopes = new Set(["data", "domain", "storage", "all"]);

export function reset(flags) {
  const name = requireString(flags, "name");
  const scope = requireString(flags, "scope");
  const dryRun = optionalBoolean(flags, "dry-run");

  if (!scopes.has(scope)) {
    throw new Error(`Unknown reset scope "${scope}". Use data, domain, storage, or all.`);
  }

  const manifest = loadManifest(name);
  if (scope === "data" || scope === "all") {
    resetData(manifest, { dryRun });
  }
  if (scope === "storage" || scope === "all") {
    resetStorage(manifest, { dryRun });
  }
  if (scope === "domain" || scope === "all") {
    resetDomain(manifest, { dryRun });
  }

  writeManifest(manifest, { dryRun });
}

function resetData(manifest, options) {
  run(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      manifest.d1.name,
      "--remote",
      "--yes",
      "--file",
      rootPath("scripts", "hqbase", "reset-d1.sql"),
      "--config",
      configPath(manifest.name)
    ],
    options
  );
  run(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      manifest.d1.name,
      "--remote",
      "--config",
      configPath(manifest.name)
    ],
    options
  );
}

function resetStorage(manifest, options) {
  run(
    "pnpm",
    [
      "exec",
      "wrangler",
      "r2",
      "bucket",
      "lifecycle",
      "add",
      manifest.r2.bucket,
      "--expire-days",
      "1"
    ],
    { ...options, allowFailure: true }
  );
  manifest.r2.resetMode = "lifecycle-expire-1-day";
}

function resetDomain(manifest, options) {
  if (!manifest.email?.domain) {
    console.log("No domain was recorded in this deployment manifest.");
    return;
  }

  const { domain } = manifest.email;
  if (manifest.email.catchAllToWorker) {
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "email",
        "routing",
        "rules",
        "update",
        domain,
        "catch-all",
        "--enabled",
        "false",
        "--action-type",
        "drop"
      ],
      { ...options, allowFailure: true }
    );
    manifest.email.catchAllToWorker = false;
  }

  if (manifest.email.sendingEnabled) {
    run("pnpm", ["exec", "wrangler", "email", "sending", "disable", domain], {
      ...options,
      allowFailure: true
    });
    manifest.email.sendingEnabled = false;
  }

  if (manifest.email.routingEnabled) {
    run("pnpm", ["exec", "wrangler", "email", "routing", "disable", domain], {
      ...options,
      allowFailure: true
    });
    manifest.email.routingEnabled = false;
  }

  writeWranglerConfig(manifest, options);
}
