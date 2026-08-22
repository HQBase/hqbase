import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const resetSql = readFileSync(path.join(rootDir, "scripts/hqbase/reset-d1.sql"), "utf8");
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
    expect(resetTables).toContain("d1_migrations");
  });

  it("drops personal access tokens explicitly", () => {
    expect(resetSql).toMatch(/DROP TABLE IF EXISTS personal_access_tokens;/u);
  });

  it("keeps the destructive workflow local for both reset and migration", () => {
    const command = packageJson.scripts["db:reset:local"];
    expect(command.match(/--local/g)).toHaveLength(2);
    expect(command).not.toContain("--remote");
    expect(command).toContain("scripts/hqbase/reset-d1.sql");
  });
});

function finalMigrationTables() {
  const tables = new Set();
  const migrationsDir = path.join(rootDir, "migrations");
  const operationPattern =
    /\b(CREATE TABLE(?: IF NOT EXISTS)?|DROP TABLE(?: IF EXISTS)?|ALTER TABLE)\s+("[^"]+"|[A-Za-z_]\w*)(?:\s+RENAME TO\s+("[^"]+"|[A-Za-z_]\w*))?/gi;

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

  return tables;
}

function unquoteIdentifier(identifier) {
  return identifier.startsWith('"') ? identifier.slice(1, -1).replaceAll('""', '"') : identifier;
}
