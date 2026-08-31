import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import { applyLocalMigrations, applyMigrationPhase } from "../../../scripts/d1-migrations.mjs";
import { completeActiveReleaseRetry, reportRecovery } from "../../../scripts/release/deploy.mjs";

const rootDir = resolve(import.meta.dirname, "../../..");
const deploySource = readFileSync(resolve(rootDir, "scripts/release/deploy.mjs"), "utf8");
const releasePackageSource = readFileSync(resolve(rootDir, "scripts/release/package.mjs"), "utf8");
const updateServiceSource = readFileSync(
  resolve(rootDir, "worker/features/updates/service.ts"),
  "utf8"
);
const cleanupMigrationSource = readFileSync(
  resolve(rootDir, "migrations-after-deploy/0001_remove_mailbox_alias_storage.sql"),
  "utf8"
);

describe("two-phase D1 migrations", () => {
  it("uses a separate ledger and removes the temporary after-deploy config", () => {
    const workspace = createWorkspace();
    const commands = [];
    let afterDeployConfig;
    try {
      applyMigrationPhase(workspace, "normal", {
        target: "remote",
        run: (command, args, cwd) => commands.push({ args, command, cwd })
      });
      applyMigrationPhase(workspace, "after-deploy", {
        target: "remote",
        randomUUID: () => "phase-test",
        run: (command, args, cwd) => {
          commands.push({ args, command, cwd });
          afterDeployConfig = JSON.parse(readFileSync(args.at(-1), "utf8"));
        }
      });

      expect(commands).toHaveLength(2);
      expect(commands[0]).toMatchObject({ command: "pnpm", cwd: workspace });
      expect(commands[0].args).toContain("--remote");
      expect(commands[0].args.at(-1)).toBe(resolve(workspace, "wrangler.jsonc"));
      expect(commands[1].args).toContain("--remote");
      expect(basename(commands[1].args.at(-1))).toBe(".wrangler-after-deploy-phase-test.jsonc");
      expect(afterDeployConfig.d1_databases[0]).toMatchObject({
        binding: "DB",
        migrations_dir: "migrations-after-deploy",
        migrations_table: "d1_migrations_after_deploy"
      });
      expect(afterDeployConfig.d1_databases[0]).not.toHaveProperty("migrations_pattern");
      expect(afterDeployConfig.name).toBe("test-worker");
      expect(existsSync(commands[1].args.at(-1))).toBe(false);
      expect(
        JSON.parse(readFileSync(resolve(workspace, "wrangler.jsonc"), "utf8")).d1_databases[0]
      ).toMatchObject({
        migrations_dir: "migrations",
        migrations_pattern: "migrations/**/migration.sql",
        migrations_table: "d1_migrations"
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("removes the temporary config when Wrangler fails", () => {
    const workspace = createWorkspace();
    const temporaryConfig = resolve(workspace, ".wrangler-after-deploy-cleanup-test.jsonc");
    try {
      expect(() =>
        applyMigrationPhase(workspace, "after-deploy", {
          target: "remote",
          randomUUID: () => "cleanup-test",
          run: () => {
            throw new Error("Wrangler failed");
          }
        })
      ).toThrow("Wrangler failed");
      expect(existsSync(temporaryConfig)).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("skips an absent after-deploy phase in an older release", () => {
    const workspace = createWorkspace();
    const temporaryConfig = resolve(workspace, ".wrangler-after-deploy-legacy-release.jsonc");
    const run = vi.fn();
    try {
      rmSync(resolve(workspace, "migrations-after-deploy"), { recursive: true });
      applyMigrationPhase(workspace, "after-deploy", {
        target: "remote",
        randomUUID: () => "legacy-release",
        run
      });

      expect(run).not.toHaveBeenCalled();
      expect(existsSync(temporaryConfig)).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("runs both local phases in order and refuses a remote CLI target", () => {
    const workspace = createWorkspace();
    const commands = [];
    try {
      applyLocalMigrations(workspace, {
        randomUUID: () => "local-test",
        run: (command, args, cwd) => commands.push({ args, command, cwd })
      });

      expect(commands).toHaveLength(2);
      expect(commands.every(({ args }) => args.includes("--local"))).toBe(true);
      expect(commands.every(({ args }) => !args.includes("--remote"))).toBe(true);
      expect(commands[0].args.at(-1)).toBe(resolve(workspace, "wrangler.jsonc"));
      expect(basename(commands[1].args.at(-1))).toBe(".wrangler-after-deploy-local-test.jsonc");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    const result = spawnSync(process.execPath, [
      resolve(rootDir, "scripts/d1-migrations.mjs"),
      "--remote"
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toContain("supports only --local");
  });

  it("publishes schema epoch 3 only after the cleanup phase", () => {
    expect(releasePackageSource).toContain("const schemaVersion = 3;");
    expect(updateServiceSource).toContain("installedSchemaVersion: 3");
    expect(cleanupMigrationSource).toContain("installed_schema_version = 3");
  });

  it("verifies the latest pending retry when a newer update is already verified", () => {
    const commands = [];
    let bookkeepingSql;

    completeActiveReleaseRetry(
      "/release",
      { schemaVersion: 16, version: "1.2.3" },
      () => commands.push("record-worker"),
      {
        applyMigrationPhase: (cwd, phase, options) =>
          commands.push(`migrate:${cwd}:${phase}:${options.target}`),
        executeSql: (cwd, sql) => {
          commands.push(`bookkeeping:${cwd}`);
          bookkeepingSql = sql;
        }
      }
    );

    expect(commands).toEqual([
      "record-worker",
      "migrate:/release:normal:remote",
      "migrate:/release:after-deploy:remote",
      "bookkeeping:/release"
    ]);
    expect(bookkeepingSql).toContain(
      "UPDATE release_state SET installed_version = '1.2.3', installed_schema_version = 16"
    );
    expect(bookkeepingSql).toContain(
      "UPDATE update_history SET state = 'verified', completed_at = datetime('now')"
    );
    expect(bookkeepingSql).toContain(
      "WHERE state IN ('started', 'deployed') AND id = (SELECT id FROM update_history WHERE to_version = '1.2.3' AND state IN ('started', 'deployed')"
    );
    expect(bookkeepingSql).toContain("ORDER BY started_at DESC, rowid DESC LIMIT 1");

    const database = new DatabaseSync(":memory:");
    try {
      database.exec(`
        CREATE TABLE release_state (
          singleton INTEGER PRIMARY KEY,
          installed_version TEXT NOT NULL,
          installed_schema_version INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO release_state VALUES (1, '1.2.2', 15, 'before');
        CREATE TABLE update_history (
          id TEXT PRIMARY KEY,
          to_version TEXT NOT NULL,
          state TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
        INSERT INTO update_history VALUES
          ('older-target', '1.2.3', 'started', '2026-08-23 10:00:00', NULL),
          ('latest-target', '1.2.3', 'verified', '2026-08-23 11:00:00', '2026-08-23 11:01:00'),
          ('other-target', '1.2.4', 'started', '2026-08-23 12:00:00', NULL);
      `);

      database.exec(bookkeepingSql);
      expect(
        database
          .prepare(
            "SELECT installed_version, installed_schema_version FROM release_state WHERE singleton = 1"
          )
          .get()
      ).toEqual({ installed_schema_version: 16, installed_version: "1.2.3" });
      expect(
        database.prepare("SELECT id, state FROM update_history ORDER BY started_at").all()
      ).toEqual([
        { id: "older-target", state: "verified" },
        { id: "latest-target", state: "verified" },
        { id: "other-target", state: "started" }
      ]);

      database.exec(bookkeepingSql);
      expect(
        database.prepare("SELECT id, state FROM update_history ORDER BY started_at").all()
      ).toEqual([
        { id: "older-target", state: "verified" },
        { id: "latest-target", state: "verified" },
        { id: "other-target", state: "started" }
      ]);
    } finally {
      database.close();
    }
  });

  it("orders each remote phase around the active Worker cutover", () => {
    const fresh = section(
      'if (!activeRelease) {\n      applyMigrationPhase(source, "normal"',
      "if (compareVersions(activeRelease.version"
    );
    expectOrder(fresh, [
      'applyMigrationPhase(source, "normal"',
      "deploySource(source, { releaseTag })",
      "recordWorkerDeployed()",
      'applyMigrationPhase(source, "after-deploy"'
    ]);

    const retry = section(
      "if (activeRelease.version === manifest.version && activeRelease.tag === releaseTag)",
      "const bookmark = findString"
    );
    expectOrder(retry, [
      "completeActiveReleaseRetry(source, manifest, recordWorkerDeployed)",
      "console.log(`HQBase"
    ]);

    const update = section("recovery = { bookmark", "console.log(`HQBase updated");
    expect(update).toContain("configFile");
    expectOrder(update, [
      'applyMigrationPhase(source, "normal"',
      '"deploy",\n        "--keep-vars"',
      '"deployments",\n        "status"',
      'applyMigrationPhase(source, "after-deploy"',
      "recovery.cleanupComplete = true",
      "UPDATE release_state SET installed_version"
    ]);

    const direct = section("function sourceDeploy(cwd)", "function reportRecovery");
    expectOrder(direct, [
      'applyMigrationPhase(cwd, "normal"',
      "deploySource(cwd)",
      'applyMigrationPhase(cwd, "after-deploy"'
    ]);
  });

  it("gives phase-safe recovery instructions", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const checkpoint = {
      bookmark: "bookmark-1",
      configFile: "/repo/.hqbase/deployments/team $(unsafe)/wrangler.jsonc",
      workerVersion: "worker-1",
      name: "hqbase"
    };
    try {
      reportRecovery({ ...checkpoint, cleanupComplete: false });
      expect(error.mock.calls.map(([message]) => message)).toEqual([
        "Run these recovery commands in order:",
        "Worker recovery: pnpm exec wrangler versions deploy 'worker-1@100%' --name 'hqbase' --config '/repo/.hqbase/deployments/team $(unsafe)/wrangler.jsonc'",
        "D1 recovery: pnpm exec wrangler d1 time-travel restore DB --bookmark 'bookmark-1' --config '/repo/.hqbase/deployments/team $(unsafe)/wrangler.jsonc'"
      ]);

      error.mockClear();
      reportRecovery({ ...checkpoint, cleanupComplete: true });
      expect(error.mock.calls.map(([message]) => message)).toEqual([
        "Recovery: rerun the same signed HQBase deployment. Schema cleanup completed, and the retry will finish release bookkeeping."
      ]);
    } finally {
      error.mockRestore();
    }
  });
});

function createWorkspace() {
  const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-d1-migrations-test-"));
  mkdirSync(resolve(workspace, "migrations-after-deploy"));
  writeFileSync(resolve(workspace, "migrations-after-deploy/0001.sql"), "SELECT 1;\n");
  writeFileSync(
    resolve(workspace, "wrangler.jsonc"),
    `${JSON.stringify(
      {
        name: "test-worker",
        d1_databases: [
          {
            binding: "DB",
            database_name: "test",
            database_id: "test-id",
            migrations_dir: "migrations",
            migrations_pattern: "migrations/**/migration.sql",
            migrations_table: "d1_migrations"
          }
        ]
      },
      null,
      2
    )}\n`
  );
  return workspace;
}

function section(start, end) {
  const startIndex = deploySource.indexOf(start);
  const endIndex = deploySource.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return deploySource.slice(startIndex, endIndex);
}

function expectOrder(source, tokens) {
  const indexes = tokens.map((token) => source.indexOf(token));
  expect(indexes.every((index) => index >= 0)).toBe(true);
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
}
