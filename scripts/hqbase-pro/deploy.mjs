#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parseTimeTravelBookmark, parseWorkerVersion } from "./backup.mjs";
import { rootDir } from "./paths.mjs";
import { assertCommunitySchema, assertProSchema } from "./upgrade.mjs";

const COMMUNITY_MARKERS = ["user", "mailboxes", "messages", "message_attachments"];
const METADATA_TABLES = new Set(["_cf_KV", "d1_migrations", "sqlite_sequence"]);

export function classifyDatabaseTables(tableNames) {
  const tables = new Set(tableNames);
  if (tables.has("pro_schema_state")) return "pro";

  const applicationTables = tableNames.filter(
    (table) => !METADATA_TABLES.has(table) && !table.startsWith("sqlite_")
  );
  if (applicationTables.length === 0) return "fresh";

  if (COMMUNITY_MARKERS.every((table) => tables.has(table))) {
    assertCommunitySchema(tableNames);
    return "community";
  }

  throw new Error(
    "D1 is non-empty but is not a recognized HQBase Community or Pro database. No changes were made."
  );
}

export function parseD1Rows(output) {
  const payload = JSON.parse(output);
  if (!Array.isArray(payload)) throw new Error("Wrangler returned invalid D1 JSON output.");
  return payload.flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []));
}

export function upgradeRecordSql(input) {
  const values = [
    "community",
    "migrated",
    input.bookmark,
    input.backupR2Key,
    input.sourceWorkerName ?? null,
    input.targetWorkerName,
    input.startedAt,
    input.migratedAt,
    input.migratedAt
  ].map(sqlValue);

  return `INSERT INTO pro_upgrade_lifecycle
    (singleton, source_edition, state, checkpoint_bookmark, backup_r2_key,
     source_worker_name, target_worker_name, started_at, migrated_at, updated_at)
    VALUES (1, ${values.join(", ")})
    ON CONFLICT(singleton) DO UPDATE SET
      checkpoint_bookmark = excluded.checkpoint_bookmark,
      backup_r2_key = excluded.backup_r2_key,
      source_worker_name = excluded.source_worker_name,
      target_worker_name = excluded.target_worker_name,
      state = 'migrated',
      started_at = excluded.started_at,
      migrated_at = excluded.migrated_at,
      deployed_at = NULL,
      cutover_verified_at = NULL,
      updated_at = excluded.updated_at`;
}

export function readDeploymentIdentity(configFile) {
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  const bucket = config.r2_buckets?.find(
    (binding) => binding.binding === "MAIL_OBJECTS"
  )?.bucket_name;
  if (typeof bucket !== "string" || !bucket) {
    throw new Error("MAIL_OBJECTS must be configured before deployment.");
  }
  if (typeof config.name !== "string" || !config.name) {
    throw new Error("The target Worker name is missing from Wrangler configuration.");
  }
  const sourceWorkerName = config.vars?.HQBASE_COMMUNITY_WORKER_NAME;
  return {
    bucket,
    sourceWorkerName: typeof sourceWorkerName === "string" ? sourceWorkerName : null,
    targetWorkerName: config.name
  };
}

export function runDeployLifecycle(options = {}) {
  const configFile = resolve(options.configFile ?? resolve(rootDir, "wrangler.jsonc"));
  const run = options.run ?? executeWrangler;
  const now = options.now ?? (() => new Date());
  const identity = options.identity ?? readDeploymentIdentity(configFile);
  const command = (args, commandOptions = {}) =>
    run([...args, "--config", configFile], commandOptions);

  const initialTables = readTables(command);
  const source = classifyDatabaseTables(initialTables);
  console.log(`Database preflight: ${source}.`);
  let updateRecovery = null;

  if (source === "pro") {
    const bookmark = parseTimeTravelBookmark(
      command(["d1", "time-travel", "info", "DB", "--json"], { quiet: true })
    );
    const workerVersion = parseWorkerVersion(
      command(["deployments", "status", "--name", identity.targetWorkerName, "--json"], {
        quiet: true
      })
    );
    updateRecovery = { bookmark, workerVersion };
    console.log(`Pre-update D1 bookmark: ${bookmark}`);
    console.log(
      `D1 recovery: pnpm exec wrangler d1 time-travel restore DB --bookmark ${bookmark} --config ${configFile}`
    );
    console.log(
      `Worker recovery: pnpm exec wrangler versions deploy ${workerVersion}@100% --name ${identity.targetWorkerName} --config ${configFile}`
    );
  }

  try {
    if (source === "community") {
      const startedAt = now().toISOString();
      const stamp = startedAt.replaceAll(":", "-");
      const backupR2Key = `_hqbase/backups/community-to-pro-${stamp}.sql`;
      const backupFile = resolve(rootDir, ".hqbase-pro", "deploy-backups", `${stamp}.sql`);
      mkdirSync(dirname(backupFile), { recursive: true });

      const bookmark = parseTimeTravelBookmark(
        command(["d1", "time-travel", "info", "DB", "--json"], { quiet: true })
      );
      console.log(`Pre-upgrade D1 bookmark: ${bookmark}`);
      console.log(
        `Rollback checkpoint: pnpm exec wrangler d1 time-travel restore DB --bookmark ${bookmark} --config ${configFile}`
      );

      try {
        command(["d1", "export", "DB", "--remote", "--output", backupFile]);
        command(["r2", "object", "put", `${identity.bucket}/${backupR2Key}`, "--file", backupFile]);
      } finally {
        rmSync(backupFile, { force: true });
      }
      console.log(`Customer-owned SQL backup: r2://${identity.bucket}/${backupR2Key}`);

      command(["d1", "migrations", "apply", "DB", "--remote"]);
      assertProSchema(readTables(command));
      const migratedAt = now().toISOString();
      command([
        "d1",
        "execute",
        "DB",
        "--remote",
        "--command",
        upgradeRecordSql({
          backupR2Key,
          bookmark,
          migratedAt,
          sourceWorkerName: identity.sourceWorkerName,
          startedAt,
          targetWorkerName: identity.targetWorkerName
        })
      ]);
      console.log(
        "Community data migrated and verified. The Community Worker has not been removed."
      );
    } else {
      command(["d1", "migrations", "apply", "DB", "--remote"]);
      assertProSchema(readTables(command));
      console.log("Pro schema verified.");
    }

    if (process.env.HQBASE_INSTALLATION_ID) {
      command([
        "d1",
        "execute",
        "DB",
        "--remote",
        "--command",
        `INSERT OR IGNORE INTO pro_entitlement (singleton, installation_id, state, can_configure, created_at, updated_at) VALUES (1, ${sqlValue(process.env.HQBASE_INSTALLATION_ID)}, 'unlicensed', 1, datetime('now'), datetime('now'))`
      ]);
    }

    if (updateRecovery && process.env.HQBASE_TARGET_VERSION) {
      command([
        "d1",
        "execute",
        "DB",
        "--remote",
        "--command",
        `INSERT INTO pro_update_history (id, from_version, to_version, checkpoint_bookmark, worker_version, state, started_at) SELECT ${sqlValue(crypto.randomUUID())}, installed_version, ${sqlValue(process.env.HQBASE_TARGET_VERSION)}, ${sqlValue(updateRecovery.bookmark)}, ${sqlValue(updateRecovery.workerVersion)}, 'started', datetime('now') FROM pro_release_state WHERE singleton = 1`
      ]);
    }

    command(["deploy"]);
    command([
      "d1",
      "execute",
      "DB",
      "--remote",
      "--command",
      "UPDATE pro_upgrade_lifecycle SET state = 'deployed', deployed_at = datetime('now'), updated_at = datetime('now') WHERE singleton = 1 AND state = 'migrated'"
    ]);

    if (process.env.HQBASE_TARGET_VERSION) {
      command([
        "d1",
        "execute",
        "DB",
        "--remote",
        "--command",
        `UPDATE pro_release_state SET installed_version = ${sqlValue(process.env.HQBASE_TARGET_VERSION)}, installed_schema_version = 12, updated_at = datetime('now') WHERE singleton = 1; UPDATE pro_update_history SET state = 'verified', completed_at = datetime('now') WHERE state = 'started' AND to_version = ${sqlValue(process.env.HQBASE_TARGET_VERSION)}`
      ]);
    }

    console.log(
      "HQBase Pro deployed. Verify the existing workspace origin, preserved resources, and mail before completing the in-place upgrade."
    );
    return { source };
  } catch (error) {
    if (updateRecovery) {
      console.error(
        `Update failed. D1 bookmark: ${updateRecovery.bookmark}. Worker version: ${updateRecovery.workerVersion}.`
      );
    }
    throw error;
  }
}

function readTables(command) {
  const output = command(
    [
      "d1",
      "execute",
      "DB",
      "--remote",
      "--json",
      "--command",
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"
    ],
    { quiet: true }
  );
  return parseD1Rows(output).map((row) => String(row.name));
}

function executeWrangler(args, options = {}) {
  const result = spawnSync(
    process.execPath,
    [resolve(rootDir, "node_modules/wrangler/bin/wrangler.js"), ...args],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, CI: process.env.CI ?? "true" }
    }
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Wrangler failed.").trim());
  }
  if (!options.quiet && result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout;
}

function sqlValue(value) {
  if (value === null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    runDeployLifecycle();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
