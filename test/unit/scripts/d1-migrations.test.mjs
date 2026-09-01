import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
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

  it("creates a fresh checkpoint and a distinct same-version history row before repair", () => {
    const commands = [];
    const recovery = [];
    const sql = [];

    const result = completeActiveReleaseRetry(
      "/release",
      { schemaVersion: 16, version: "1.2.3" },
      () => commands.push("record-worker"),
      {
        activeRelease: { versionId: "worker-current" },
        afterDeployState: { phase: "S0", pendingUpdate: null },
        applyMigrationPhase: (cwd, phase, options) =>
          commands.push(`migrate:${cwd}:${phase}:${options.target}`),
        configFile: "/customer/wrangler.jsonc",
        createRecoveryBookmark: () => {
          commands.push("checkpoint");
          return "bookmark-fresh";
        },
        executeSql: (cwd, statement) => {
          commands.push(`sql:${cwd}`);
          sql.push(statement);
        },
        onRecovery: (checkpoint) => recovery.push(checkpoint),
        randomUUID: () => "repair-update",
        workerName: "hqbase"
      }
    );

    expect(commands).toEqual([
      "checkpoint",
      "sql:/release",
      "record-worker",
      "migrate:/release:normal:remote",
      "migrate:/release:after-deploy:remote",
      "sql:/release"
    ]);
    expect(sql[0]).toContain(
      "VALUES ('repair-update', '1.2.3', '1.2.3', 'bookmark-fresh', 'worker-current', 'started'"
    );
    expect(sql[1]).toContain("WHERE id = 'repair-update' AND state IN ('started', 'deployed')");
    expect(sql[1]).not.toContain("SELECT id FROM update_history");
    expect(recovery).toHaveLength(1);
    expect(recovery[0]).toMatchObject({
      bookmark: "bookmark-fresh",
      cleanupComplete: true,
      configFile: "/customer/wrangler.jsonc",
      name: "hqbase",
      workerVersion: "worker-current"
    });
    expect(result).toEqual({ phase: "S0", repaired: true, workerRecorded: true });
  });

  it.each(["S1", "S2"])("resumes the exact pending %s repair row", (phase) => {
    const commands = [];
    const sql = [];
    const checkpoint = vi.fn();

    completeActiveReleaseRetry(
      "/release",
      { schemaVersion: 16, version: "1.2.3" },
      () => commands.push("record-worker"),
      {
        activeRelease: { versionId: "worker-current" },
        afterDeployState: {
          phase,
          pendingUpdate: {
            checkpoint_bookmark: "bookmark-original",
            from_version: "1.2.3",
            id: "repair-original",
            state: "started",
            to_version: "1.2.3",
            worker_version: "worker-original"
          }
        },
        applyMigrationPhase: (cwd, migrationPhase, options) =>
          commands.push(`migrate:${cwd}:${migrationPhase}:${options.target}`),
        createRecoveryBookmark: checkpoint,
        executeSql: (_cwd, statement) => sql.push(statement)
      }
    );

    expect(checkpoint).not.toHaveBeenCalled();
    expect(commands).toEqual([
      "record-worker",
      "migrate:/release:normal:remote",
      "migrate:/release:after-deploy:remote"
    ]);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("WHERE id = 'repair-original'");
  });

  it("leaves a complete S3 database unchanged and finalizes only its pending repair row", () => {
    const recordWorker = vi.fn();
    const migrate = vi.fn();
    const execute = vi.fn();
    const complete = { phase: "S3", pendingUpdate: null };

    expect(
      completeActiveReleaseRetry(
        "/release",
        { schemaVersion: 16, version: "1.2.3" },
        recordWorker,
        {
          afterDeployState: complete,
          applyMigrationPhase: migrate,
          executeSql: execute
        }
      )
    ).toEqual({ phase: "S3", repaired: false, workerRecorded: false });
    expect(recordWorker).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();

    completeActiveReleaseRetry("/release", { schemaVersion: 16, version: "1.2.3" }, recordWorker, {
      afterDeployState: {
        phase: "S3",
        pendingUpdate: {
          checkpoint_bookmark: "bookmark-original",
          from_version: "1.2.3",
          id: "repair-original",
          state: "started",
          to_version: "1.2.3",
          worker_version: "worker-original"
        }
      },
      applyMigrationPhase: migrate,
      executeSql: execute
    });
    expect(recordWorker).toHaveBeenCalledOnce();
    expect(migrate).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][1]).toContain("WHERE id = 'repair-original'");
  });

  it("does not mutate anything when state inspection fails", () => {
    const recordWorker = vi.fn();
    const migrate = vi.fn();
    const execute = vi.fn();
    const checkpoint = vi.fn();

    expect(() =>
      completeActiveReleaseRetry(
        "/release",
        { schemaVersion: 16, version: "1.2.3" },
        recordWorker,
        {
          applyMigrationPhase: migrate,
          createRecoveryBookmark: checkpoint,
          executeSql: execute,
          inspectAfterDeployState: () => {
            throw new Error("inconsistent post-deploy state");
          }
        }
      )
    ).toThrow("inconsistent post-deploy state");
    expect(recordWorker).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
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
      "completeActiveReleaseRetry(source, manifest, recordWorkerDeployed, {",
      "console.log(`HQBase"
    ]);

    const update = section("recovery = { bookmark", "console.log(`HQBase updated");
    expect(update).toContain("configFile");
    expectOrder(update, [
      'applyMigrationPhase(source, "normal"',
      '"deploy",\n        "--keep-vars"',
      "assertRequiredActiveBindings(inspectActiveRelease(source, config.name))",
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
