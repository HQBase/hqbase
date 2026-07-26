import fs from "node:fs";
import path from "node:path";

import { optionalBoolean, requireString } from "./args.mjs";
import { createBackup } from "./backup.mjs";
import { run } from "./command.mjs";
import { configPath, loadManifest } from "./manifest.mjs";

export function validateBackupManifest(value, deployment) {
  if (
    value?.format !== "hqbase-backup-v1" ||
    value.deployment !== deployment ||
    typeof value.d1?.bookmark !== "string" ||
    typeof value.worker?.version !== "string"
  ) {
    throw new Error("Backup manifest is invalid or belongs to a different deployment.");
  }
  return value;
}

export function restore(flags) {
  const name = requireString(flags, "name");
  const backupPath = path.resolve(process.cwd(), requireString(flags, "backup"));
  if (!optionalBoolean(flags, "yes")) {
    throw new Error("Restore is destructive and requires --yes.");
  }
  const manifest = loadManifest(name);
  const target = validateBackupManifest(JSON.parse(fs.readFileSync(backupPath, "utf8")), name);
  const safety = createBackup(name);
  console.log(`Pre-restore safety bookmark: ${safety.backup.d1.bookmark}`);
  run("pnpm", [
    "exec",
    "wrangler",
    "d1",
    "time-travel",
    "restore",
    manifest.d1.name,
    "--bookmark",
    target.d1.bookmark,
    "--config",
    configPath(name)
  ]);
  run("pnpm", [
    "exec",
    "wrangler",
    "versions",
    "deploy",
    `${target.worker.version}@100%`,
    "--name",
    manifest.worker.name,
    "--yes",
    "--config",
    configPath(name)
  ]);
  run("pnpm", [
    "exec",
    "wrangler",
    "d1",
    "execute",
    manifest.d1.name,
    "--remote",
    "--command",
    "SELECT value FROM hqbase_schema_state WHERE key = 'product'; SELECT product, installed_version, installed_schema_version FROM release_state WHERE singleton = 1;",
    "--config",
    configPath(name)
  ]);
  console.log(`Database and Worker version ${target.worker.version} restored and verified.`);
}
