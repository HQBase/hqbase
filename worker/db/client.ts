import { eq } from "drizzle-orm";
import type { z } from "zod";

import { AppError } from "../lib/errors";
import { createDatabase } from "./drizzle";
import { appSettings } from "./schema";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function getRequiredSetting<T>(
  db: D1Database,
  key: string,
  schema: z.ZodType<T>
): Promise<T> {
  const value = await getSetting(db, key, schema);
  if (value === null) {
    throw new AppError("SETTING_NOT_FOUND", `Missing setting ${key}.`, 500);
  }
  return value;
}

export async function getSetting<T>(
  db: D1Database,
  key: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  const database = createDatabase(db);
  const row = await database
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();

  if (!row) {
    return null;
  }

  return schema.parse(row.value);
}

export async function setSetting(db: D1Database, key: string, value: unknown): Promise<void> {
  const timestamp = nowIso();
  const database = createDatabase(db);
  await database
    .insert(appSettings)
    .values({
      key,
      value,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedAt: timestamp
      }
    })
    .run();
}
