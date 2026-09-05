import fs from "node:fs";
import path from "node:path";

import { optionalBoolean, requireString } from "./args.mjs";
import { createBackup, parseTimeTravelBookmark, parseWorkerVersion } from "./backup.mjs";
import { run } from "./command.mjs";
import { configPath, loadManifest } from "./manifest.mjs";
import {
  inspectRelease,
  validateRelease,
  verifyObjectReferences
} from "./recovery-verification.mjs";

export function validateBackupManifest(value, deployment, manifest, now = Date.now()) {
  if (
    value?.format !== "hqbase-backup-v2" ||
    value.deployment !== deployment ||
    typeof value.d1?.bookmark !== "string" ||
    typeof value.worker?.version !== "string"
  ) {
    throw new Error("Backup manifest is invalid or belongs to a different deployment.");
  }
  if (
    !Number.isFinite(Date.parse(value.createdAt)) ||
    Date.parse(value.createdAt) > now + 60_000 ||
    now - Date.parse(value.createdAt) > 30 * 86_400_000
  ) {
    throw new Error(
      "The recovery checkpoint date is invalid or outside the maximum Time Travel window."
    );
  }
  if (
    manifest &&
    (value.accountId !== manifest.accountId ||
      value.d1.id !== manifest.d1.id ||
      value.d1.name !== manifest.d1.name ||
      value.worker.name !== manifest.worker.name ||
      value.r2?.bucket !== manifest.r2.bucket)
  ) {
    throw new Error("The checkpoint resource identities do not match this deployment.");
  }
  validateRelease([value.release]);
  return value;
}

export async function restore(flags) {
  const name = requireString(flags, "name");
  const backupPath = path.resolve(process.cwd(), requireString(flags, "backup"));
  if (!optionalBoolean(flags, "yes")) {
    throw new Error("Restore is destructive and requires --yes.");
  }
  const manifest = loadManifest(name);
  const target = validateBackupManifest(
    JSON.parse(fs.readFileSync(backupPath, "utf8")),
    name,
    manifest
  );
  parseTimeTravelBookmark(
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "time-travel",
        "info",
        manifest.d1.name,
        "--timestamp",
        target.createdAt,
        "--json",
        "--config",
        configPath(name)
      ],
      { quiet: true, stdoutOnly: true }
    )
  );
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
  validateRelease([inspectRelease(manifest)], target.release);
  const activeVersion = parseWorkerVersion(
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
        configPath(name)
      ],
      { quiet: true, stdoutOnly: true }
    )
  );
  if (activeVersion !== target.worker.version)
    throw new Error("The active Worker version does not match the recovery checkpoint.");
  const verifiedObjects = await verifyObjectReferences(manifest);
  console.log(
    `Database and Worker version ${target.worker.version} restored and verified (${verifiedObjects} mail objects).`
  );
}
