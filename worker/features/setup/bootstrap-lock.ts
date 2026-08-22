import { AppError } from "../../lib/errors";

const bootstrapLockKey = "setup_bootstrap_lock";
const bootstrapLockTtlMs = 5 * 60 * 1000;

export type BootstrapLock = {
  value: string;
};

export async function claimBootstrapLock(db: D1Database, now = new Date()): Promise<BootstrapLock> {
  const value = JSON.stringify({ token: crypto.randomUUID() });
  const timestamp = now.toISOString();
  const staleBefore = new Date(now.getTime() - bootstrapLockTtlMs).toISOString();
  const claimed = await db
    .prepare(
      `INSERT INTO app_settings (key, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at
       WHERE app_settings.updated_at < ?
       RETURNING value_json`
    )
    .bind(bootstrapLockKey, value, timestamp, timestamp, staleBefore)
    .first<{ value_json: string }>();

  if (claimed?.value_json !== value) {
    throw new AppError("SETUP_IN_PROGRESS", "Setup is already being completed.", 409);
  }
  return { value };
}

export async function releaseBootstrapLock(db: D1Database, lock: BootstrapLock): Promise<void> {
  await db
    .prepare("DELETE FROM app_settings WHERE key = ? AND value_json = ?")
    .bind(bootstrapLockKey, lock.value)
    .run();
}
