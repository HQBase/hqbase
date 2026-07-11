#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { optionalBoolean, optionalString, parseArgs, requireString } from "./args.mjs";
import { rootDir } from "./paths.mjs";

const COMMUNITY_TABLES = [
  "account",
  "app_settings",
  "mailboxes",
  "message_attachments",
  "messages",
  "session",
  "threads",
  "user",
  "verification"
];

const PRO_TABLES = [
  "pro_app_passwords",
  "pro_bridge_mutations",
  "pro_bridge_submissions",
  "pro_imap_mailboxes",
  "pro_imap_messages",
  "pro_mail_sessions",
  "pro_schema_state"
];

export function validateUpgradeOptions(flags) {
  if (!optionalBoolean(flags, "from-community")) {
    throw new Error("Only --from-community upgrades are currently supported.");
  }

  const database = requireString(flags, "database");
  const local = optionalBoolean(flags, "local");
  const remote = optionalBoolean(flags, "remote");
  if (local === remote) {
    throw new Error("Choose exactly one target: --local or --remote.");
  }

  const dryRun = optionalBoolean(flags, "dry-run");
  if (remote && !dryRun && !optionalBoolean(flags, "yes")) {
    throw new Error("Remote upgrades require --yes after reviewing a --dry-run.");
  }

  return {
    database,
    dryRun,
    local,
    remote,
    backup: optionalString(flags, "backup")
  };
}

export function assertCommunitySchema(tableNames) {
  const tables = new Set(tableNames);
  const missing = COMMUNITY_TABLES.filter((table) => !tables.has(table));
  if (missing.length > 0) {
    throw new Error(
      `Database is not a recognized HQBase Community schema. Missing: ${missing.join(", ")}.`
    );
  }
}

export function assertProSchema(tableNames) {
  const tables = new Set(tableNames);
  const missing = PRO_TABLES.filter((table) => !tables.has(table));
  if (missing.length > 0) {
    throw new Error(`Pro migration verification failed. Missing: ${missing.join(", ")}.`);
  }
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
    const detail = (result.stderr || result.stdout || "Wrangler failed.").trim();
    throw new Error(detail);
  }
  if (!options.quiet && result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
  return result.stdout;
}

function targetFlag(options) {
  return options.local ? "--local" : "--remote";
}

function readTables(options) {
  const output = executeWrangler(
    [
      "d1",
      "execute",
      options.database,
      targetFlag(options),
      "--json",
      "--command",
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"
    ],
    { quiet: true }
  );
  const payload = JSON.parse(output);
  const rows = payload.flatMap((entry) => entry.results ?? []);
  return rows.map((row) => String(row.name));
}

function backupPath(options) {
  if (options.backup) {
    return resolve(process.cwd(), options.backup);
  }
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return resolve(rootDir, ".hqbase-pro", "backups", `${options.database}-${stamp}.sql`);
}

export function runUpgrade(options) {
  console.log(`HQBase Community -> Pro (${options.local ? "local" : "remote"})`);
  assertCommunitySchema(readTables(options));
  console.log("Preflight: recognized Community schema.");

  if (options.dryRun) {
    console.log("Dry run complete. No database changes were made.");
    console.log("Next: rerun without --dry-run; add --yes for a remote database.");
    return;
  }

  if (options.remote) {
    const output = backupPath(options);
    mkdirSync(dirname(output), { recursive: true });
    executeWrangler(["d1", "export", options.database, "--remote", "--output", output]);
    console.log(`Backup: ${output}`);
  }

  executeWrangler(["d1", "migrations", "apply", options.database, targetFlag(options)]);
  assertProSchema(readTables(options));
  console.log("Upgrade complete: Pro schema verified and Community data retained.");
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  runUpgrade(validateUpgradeOptions(flags));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
