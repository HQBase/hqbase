import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const resetSql = readFileSync(path.join(rootDir, "scripts/hqbase/reset-d1.sql"), "utf8");
const resetSource = readFileSync(path.join(rootDir, "scripts/hqbase/reset.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));

describe("local D1 reset", () => {
  it("drops every table left by the current migrations", () => {
    const existingTables = finalMigrationTables();
    const resetTables = new Set(
      [...resetSql.matchAll(/\bDROP TABLE IF EXISTS\s+("[^"]+"|[A-Za-z_]\w*)/gi)].map((match) =>
        unquoteIdentifier(match[1])
      )
    );

    expect([...existingTables].filter((table) => !resetTables.has(table))).toEqual([]);
    expect(resetTables).toContain("mailbox_address_migration");
    expect(resetTables).toContain("d1_migrations");
    expect(resetTables).toContain("d1_migrations_after_deploy");
  });

  it("keeps the destructive workflow local for both reset and migration", () => {
    const resetCommand = packageJson.scripts["db:reset:local"];
    const migrateCommand = packageJson.scripts["db:migrate:local"];
    expect(resetCommand.match(/--local/g)).toHaveLength(2);
    expect(resetCommand).not.toContain("--remote");
    expect(resetCommand).toContain("scripts/hqbase/reset-d1.sql");
    expect(resetCommand).toContain("node scripts/d1-migrations.mjs --local");
    expect(migrateCommand.match(/--local/g)).toHaveLength(1);
    expect(migrateCommand).not.toContain("--remote");
    expect(migrateCommand).toBe("node scripts/d1-migrations.mjs --local");
  });

  it("rebuilds remote data through both migration phases", () => {
    const executeReset = resetSource.indexOf('rootPath("scripts", "hqbase", "reset-d1.sql")');
    const normal = resetSource.indexOf('applyMigrationPhase(rootPath(), "normal"');
    const afterDeploy = resetSource.indexOf('applyMigrationPhase(rootPath(), "after-deploy"');
    expect(executeReset).toBeGreaterThan(-1);
    expect(normal).toBeGreaterThan(executeReset);
    expect(afterDeploy).toBeGreaterThan(normal);
    expect(resetSource).toContain('target: "remote"');
    expect(resetSource).toContain("run: (command, args) => run(command, args, options)");
  });
});

function finalMigrationTables() {
  const tables = new Set();
  const operationPattern =
    /\b(CREATE TABLE(?: IF NOT EXISTS)?|DROP TABLE(?: IF EXISTS)?|ALTER TABLE)\s+("[^"]+"|[A-Za-z_]\w*)(?:\s+RENAME TO\s+("[^"]+"|[A-Za-z_]\w*))?/gi;

  for (const directory of ["migrations", "migrations-after-deploy"]) {
    const migrationsDir = path.join(rootDir, directory);
    for (const filename of readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const source = readFileSync(path.join(migrationsDir, filename), "utf8");
      for (const match of source.matchAll(operationPattern)) {
        const operation = match[1].toUpperCase();
        const table = unquoteIdentifier(match[2]);
        if (operation.startsWith("CREATE TABLE")) {
          tables.add(table);
        } else if (operation.startsWith("DROP TABLE")) {
          tables.delete(table);
        } else if (match[3]) {
          tables.delete(table);
          tables.add(unquoteIdentifier(match[3]));
        }
      }
    }
  }

  return tables;
}

function unquoteIdentifier(identifier) {
  return identifier.startsWith('"') ? identifier.slice(1, -1).replaceAll('""', '"') : identifier;
}
