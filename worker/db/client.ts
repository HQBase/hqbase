import type { z } from "zod";

import { AppError } from "../lib/errors";

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
  const row = await db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .bind(key)
    .first<{ value_json: string }>();

  if (!row) {
    return null;
  }

  return schema.parse(JSON.parse(row.value_json));
}

export async function setSetting(db: D1Database, key: string, value: unknown): Promise<void> {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO app_settings (key, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .bind(key, JSON.stringify(value), timestamp, timestamp)
    .run();
}
