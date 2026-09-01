import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { afterEach, describe, expect, it } from "vitest";

import {
  afterDeploySchemaSql,
  classifyAfterDeployState,
  parseD1Rows
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
    expect(() => parseD1Rows("{}")).toThrow("no D1 inspection results");
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

function classify(database, normal, hasAfterDeployLedger) {
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
    schemaItems: inspectSchema(database)
  });
}

function inspectSchema(database) {
  return database
    .prepare(afterDeploySchemaSql)
    .all()
    .map(({ item }) => item);
}
