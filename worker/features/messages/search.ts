import { type SQL, sql } from "drizzle-orm";

/** Matches literal text without D1's 50-byte `LIKE` pattern limit. */
export function literalContains(column: SQL, value: string): SQL {
  return sql`instr(lower(CAST(${column} AS TEXT)), lower(${value})) > 0`;
}

export function literalStartsWith(column: SQL, value: string): SQL {
  return sql`instr(lower(CAST(${column} AS TEXT)), lower(${value})) = 1`;
}
