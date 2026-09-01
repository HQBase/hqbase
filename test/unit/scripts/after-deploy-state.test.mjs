import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { afterEach, describe, expect, it } from "vitest";

import {
  afterDeploySchemaSql,
  afterDeploySchemaSqlStatements,
  classifyAfterDeployState,
  parseD1Rows,
  queryRemoteD1
} from "../../../scripts/release/after-deploy-state.mjs";

const migrationsDirectory = resolve(import.meta.dirname, "../../../migrations");
const afterDeployMigrationsDirectory = resolve(
  import.meta.dirname,
  "../../../migrations-after-deploy"
);
const databases = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("after-deploy state inspection", () => {
  it("recognizes only the exact S0, S1, S2, and S3 ledger and schema pairs", async () => {
    const database = createDatabase();
    const normal = await readD1Migrations(migrationsDirectory);
    const afterDeploy = await readD1Migrations(afterDeployMigrationsDirectory);
    for (const migration of normal) applyMigration(database, migration, "d1_migrations");

    expect(classify(database, normal, false)).toMatchObject({
      phase: "S0",
      repairRequired: true
    });
    createAfterDeployLedger(database);
    expect(classify(database, normal, true)).toMatchObject({
      phase: "S0",
      repairRequired: true
    });

    for (const [index, migration] of afterDeploy.entries()) {
      applyMigration(database, migration, "d1_migrations_after_deploy");
      expect(classify(database, normal, true)).toMatchObject({
        phase: `S${index + 1}`,
        repairRequired: index + 1 < afterDeploy.length
      });
    }
    expect(
      classify(database, normal, true, [
        {
          checkpoint_bookmark: "bookmark-before-repair",
          from_version: "1.3.2",
          id: "repair-update",
          state: "started",
          to_version: "1.3.3",
          worker_version: "worker-before-repair"
        }
      ])
    ).toMatchObject({ phase: "S3", repairRequired: true });
  });

  it("fails closed when a ledger is incomplete, out of order, or unlike the live schema", async () => {
    const database = createDatabase();
    const normal = await readD1Migrations(migrationsDirectory);
    for (const migration of normal) applyMigration(database, migration, "d1_migrations");
    const schemaItems = inspectSchema(database);
    const normalNames = normal.map(({ name }) => name);

    expect(() =>
      classifyAfterDeployState({
        appliedAfterDeployMigrations: [],
        expectedNormalMigrations: normalNames,
        hasAfterDeployLedger: false,
        normalMigrations: normalNames.slice(0, -1),
        schemaItems
      })
    ).toThrow("normal migration ledger is not complete");
    expect(() =>
      classifyAfterDeployState({
        appliedAfterDeployMigrations: ["0002_finalize_agent_principals.sql"],
        expectedNormalMigrations: normalNames,
        hasAfterDeployLedger: true,
        normalMigrations: normalNames,
        schemaItems: [...schemaItems, "table:d1_migrations_after_deploy"]
      })
    ).toThrow("after-deploy migration ledger is not an exact prefix");
    expect(() =>
      classifyAfterDeployState({
        appliedAfterDeployMigrations: [],
        expectedNormalMigrations: normalNames,
        hasAfterDeployLedger: false,
        normalMigrations: normalNames,
        schemaItems: schemaItems.filter((item) => item !== "column:drafts.user_id")
      })
    ).toThrow("migration ledger and the live schema do not match");
    expect(() =>
      classifyAfterDeployState({
        appliedAfterDeployMigrations: [],
        expectedNormalMigrations: normalNames,
        hasAfterDeployLedger: false,
        normalMigrations: normalNames,
        pendingUpdates: [{}, {}],
        schemaItems
      })
    ).toThrow("More than one update is pending");
  });

  it("accepts Wrangler D1 JSON wrappers and rejects output without result rows", () => {
    expect(parseD1Rows(JSON.stringify([{ results: [{ name: "0001.sql" }] }]))).toEqual([
      { name: "0001.sql" }
    ]);
    expect(
      parseD1Rows(JSON.stringify({ result: [{ results: [{ item: "table:drafts" }] }] }))
    ).toEqual([{ item: "table:drafts" }]);
    expect(
      parseD1Rows(
        JSON.stringify([
          { results: [{ item: "table:drafts" }] },
          { results: [{ item: "column:drafts.id" }] }
        ])
      )
    ).toEqual([{ item: "table:drafts" }, { item: "column:drafts.id" }]);
    expect(() => parseD1Rows(JSON.stringify([{ results: [], success: false }]))).toThrow(
      "failed D1 inspection statement"
    );
    expect(() => parseD1Rows("{}")).toThrow("no D1 inspection results");
  });

  it("keeps remote schema inspection within the D1 compound-select limit", () => {
    expect(afterDeploySchemaSqlStatements).toHaveLength(2);
    for (const statement of afterDeploySchemaSqlStatements) {
      expect(statement.split(/\b(?:UNION(?:\s+ALL)?|INTERSECT|EXCEPT)\b/i)).toHaveLength(5);
    }
    expect(afterDeploySchemaSql).toBe(afterDeploySchemaSqlStatements.join(";\n"));
  });

  it("sends both schema statements in one remote command and surfaces a failure", () => {
    const attempts = [];
    expect(
      queryRemoteD1("/source", afterDeploySchemaSql, {
        attempt(command, args, cwd) {
          attempts.push({ args, command, cwd });
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify([
              { results: [{ item: "table:drafts" }] },
              { results: [{ item: "column:drafts.id" }] }
            ])
          };
        }
      })
    ).toEqual([{ item: "table:drafts" }, { item: "column:drafts.id" }]);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ command: "pnpm", cwd: "/source" });
    expect(attempts[0].args[attempts[0].args.indexOf("--command") + 1]).toBe(afterDeploySchemaSql);

    const captures = [];
    expect(
      queryRemoteD1("/source", "SELECT 1", {
        capture(command, args, cwd) {
          captures.push({ args, command, cwd });
          return JSON.stringify([{ results: [{ item: "table:drafts" }] }]);
        }
      })
    ).toEqual([{ item: "table:drafts" }]);
    expect(captures).toHaveLength(1);

    let emitted;
    expect(() =>
      queryRemoteD1("/source", "SELECT 1", {
        attempt: () => ({ status: 1, stderr: "D1 error 7500", stdout: "" }),
        emit: (result) => {
          emitted = result;
        }
      })
    ).toThrow("wrangler d1 inspection exited with status 1");
    expect(emitted?.stderr).toBe("D1 error 7500");
  });
});

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  databases.push(database);
  return database;
}

function createAfterDeployLedger(database) {
  database.exec(`
    CREATE TABLE d1_migrations_after_deploy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function applyMigration(database, migration, table) {
  database.exec("BEGIN");
  try {
    for (const query of migration.queries) database.exec(query);
    database.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(migration.name);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function classify(database, normal, hasAfterDeployLedger, pendingUpdates = []) {
  return classifyAfterDeployState({
    appliedAfterDeployMigrations: hasAfterDeployLedger
      ? database
          .prepare("SELECT name FROM d1_migrations_after_deploy ORDER BY id")
          .all()
          .map(({ name }) => name)
      : [],
    expectedNormalMigrations: normal.map(({ name }) => name),
    hasAfterDeployLedger,
    normalMigrations: database
      .prepare("SELECT name FROM d1_migrations ORDER BY id")
      .all()
      .map(({ name }) => name),
    pendingUpdates,
    schemaItems: inspectSchema(database)
  });
}

function inspectSchema(database) {
  return afterDeploySchemaSqlStatements.flatMap((statement) =>
    database
      .prepare(statement)
      .all()
      .map(({ item }) => item)
  );
}
