import { AppError } from "../../lib/errors";

const updateBuildLockTtlMs = 5 * 60 * 1000;

type UpdateBuildLock = {
  key: string;
  value: string;
};

export async function withUpdateBuildLock<T>(
  db: D1Database,
  triggerId: string,
  task: () => Promise<T>,
  now = new Date()
): Promise<T> {
  const lock = await claimUpdateBuildLock(db, triggerId, now);
  try {
    return await task();
  } finally {
    await releaseUpdateBuildLock(db, lock).catch(() => undefined);
  }
}

async function claimUpdateBuildLock(
  db: D1Database,
  triggerId: string,
  now: Date
): Promise<UpdateBuildLock> {
  const lock = {
    key: `update_build_lock:${triggerId}`,
    value: JSON.stringify({ token: crypto.randomUUID() })
  };
  const timestamp = now.toISOString();
  const staleBefore = new Date(now.getTime() - updateBuildLockTtlMs).toISOString();
  const claimed = await db
    .prepare(
      `INSERT INTO app_settings (key, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at
       WHERE app_settings.updated_at <= ?
       RETURNING value_json`
    )
    .bind(lock.key, lock.value, timestamp, timestamp, staleBefore)
    .first<{ value_json: string }>();
  if (claimed?.value_json !== lock.value) {
    throw new AppError(
      "UPDATE_IN_PROGRESS",
      "Another update is already starting. Wait a moment and check for updates again.",
      409
    );
  }
  return lock;
}

async function releaseUpdateBuildLock(db: D1Database, lock: UpdateBuildLock): Promise<void> {
  await db
    .prepare("DELETE FROM app_settings WHERE key = ? AND value_json = ?")
    .bind(lock.key, lock.value)
    .run();
}
