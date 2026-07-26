import fs from "node:fs";
import path from "node:path";

import { optionalString, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { configPath, deploymentDir, loadManifest } from "./manifest.mjs";

function findString(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === "string") return child;
    const nested = findString(child, keys);
    if (nested) return nested;
  }
  return null;
}

export function parseTimeTravelBookmark(output) {
  const bookmark = findString(JSON.parse(output), new Set(["bookmark"]));
  if (!bookmark) throw new Error("D1 Time Travel did not return a bookmark.");
  return bookmark;
}

export function parseWorkerVersion(output) {
  const version = findString(JSON.parse(output), new Set(["version_id", "versionId"]));
  if (!version) throw new Error("Worker deployment status did not return a version ID.");
  return version;
}

export function createBackup(name, options = {}) {
  const manifest = loadManifest(name);
  const config = configPath(name);
  const bookmark = parseTimeTravelBookmark(
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "time-travel",
        "info",
        manifest.d1.name,
        "--json",
        "--config",
        config
      ],
      { quiet: true }
    )
  );
  const workerVersion = parseWorkerVersion(
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deployments",
        "status",
        "--name",
        manifest.worker.name,
        "--json",
        "--config",
        config
      ],
      { quiet: true }
    )
  );
  const r2 = JSON.parse(
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "r2",
        "bucket",
        "info",
        manifest.r2.bucket,
        "--json",
        "--config",
        config
      ],
      { quiet: true }
    )
  );
  const createdAt = new Date().toISOString();
  const backup = {
    format: "hqbase-backup-v1",
    deployment: name,
    createdAt,
    d1: { name: manifest.d1.name, id: manifest.d1.id, bookmark },
    worker: { name: manifest.worker.name, version: workerVersion },
    r2: { bucket: manifest.r2.bucket, inventory: r2 }
  };
  const output = options.output
    ? path.resolve(process.cwd(), options.output)
    : path.join(deploymentDir(name), "backups", `${createdAt.replaceAll(":", "-")}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600 });
  console.log(`Backup manifest: ${output}`);
  console.log(
    `D1 rollback: pnpm exec wrangler d1 time-travel restore ${manifest.d1.name} --bookmark ${bookmark}`
  );
  return { backup, output };
}

export function backup(flags) {
  return createBackup(requireString(flags, "name"), { output: optionalString(flags, "output") });
}
