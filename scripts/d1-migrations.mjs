#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { run } from "./release/command.mjs";

const root = resolve(import.meta.dirname, "..");
const afterDeployDirectory = "migrations-after-deploy";
const afterDeployTable = "d1_migrations_after_deploy";

export function applyMigrationPhase(cwd, phase, options = {}) {
  const target = options.target;
  if (target !== "local" && target !== "remote") {
    throw new Error('D1 migration target must be "local" or "remote".');
  }
  if (phase !== "normal" && phase !== "after-deploy") {
    throw new Error('D1 migration phase must be "normal" or "after-deploy".');
  }

  const configFile = resolve(options.configFile ?? resolve(cwd, "wrangler.jsonc"));
  if (phase === "normal") {
    runMigrations(cwd, configFile, target, options.run);
    return;
  }
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  const database = config.d1_databases?.find(({ binding }) => binding === "DB");
  if (!database) throw new Error("wrangler.jsonc has no DB binding.");
  const migrationDirectory = resolve(cwd, afterDeployDirectory);
  if (!existsSync(migrationDirectory)) return;

  database.migrations_dir = relative(dirname(configFile), migrationDirectory).replaceAll("\\", "/");
  database.migrations_table = afterDeployTable;
  delete database.migrations_pattern;

  const id = (options.randomUUID ?? randomUUID)();
  const temporaryConfig = resolve(dirname(configFile), `.wrangler-after-deploy-${id}.jsonc`);
  let created = false;
  try {
    writeFileSync(temporaryConfig, `${JSON.stringify(config, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600
    });
    created = true;
    runMigrations(cwd, temporaryConfig, target, options.run);
  } finally {
    if (created) rmSync(temporaryConfig, { force: true });
  }
}

export function applyLocalMigrations(cwd = root, options = {}) {
  applyMigrationPhase(cwd, "normal", { ...options, target: "local" });
  applyMigrationPhase(cwd, "after-deploy", { ...options, target: "local" });
}

function runMigrations(cwd, configFile, target, runCommand = run) {
  runCommand(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "DB", `--${target}`, "--config", configFile],
    cwd
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--local") {
    throw new Error(
      "This command supports only --local. Remote migrations run through the reviewed deployment flow."
    );
  }
  applyLocalMigrations();
}
