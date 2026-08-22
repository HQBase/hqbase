import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDatabase(client: D1Database) {
  return drizzle(client, { schema });
}

export async function getRow<T>(client: D1Database, query: SQL): Promise<T | null> {
  return (await createDatabase(client).get<T>(query)) ?? null;
}

export function getRows<T>(client: D1Database, query: SQL): Promise<T[]> {
  return createDatabase(client).all<T>(query);
}
