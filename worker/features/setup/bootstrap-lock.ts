import { AppError } from "../../lib/errors";

const bootstrapLockKey = "setup_bootstrap_lock";
const bootstrapLockTtlMs = 5 * 60 * 1000;
const bootstrapLockHeartbeatMs = 30 * 1000;

export type BootstrapLock = {
  value: string;
};

export type BootstrapLockHeartbeat = {
  renew: () => Promise<void>;
  stop: () => Promise<void>;
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
       WHERE app_settings.updated_at <= ?
       RETURNING value_json`
    )
    .bind(bootstrapLockKey, value, timestamp, timestamp, staleBefore)
    .first<{ value_json: string }>();

  if (claimed?.value_json !== value) {
    throw new AppError("SETUP_IN_PROGRESS", "Setup is already being completed.", 409);
  }
  return { value };
}

export async function renewBootstrapLock(
  db: D1Database,
  lock: BootstrapLock,
  now = new Date()
): Promise<void> {
  const renewed = await db
    .prepare(
      `UPDATE app_settings
       SET updated_at = ?
       WHERE key = ? AND value_json = ?
       RETURNING value_json`
    )
    .bind(now.toISOString(), bootstrapLockKey, lock.value)
    .first<{ value_json: string }>();
  if (renewed?.value_json !== lock.value) {
    throw new AppError("SETUP_LOCK_LOST", "Setup lost its exclusive bootstrap claim.", 409);
  }
}

export function startBootstrapLockHeartbeat(
  db: D1Database,
  lock: BootstrapLock,
  intervalMs = bootstrapLockHeartbeatMs
): BootstrapLockHeartbeat {
  let pending = Promise.resolve();
  let failure: unknown;
  const enqueueRenewal = () => {
    const renewal = pending.then(() => renewBootstrapLock(db, lock));
    pending = renewal.catch((error: unknown) => {
      failure ??= error;
    });
    return renewal;
  };
  const timer = setInterval(() => {
    void enqueueRenewal().catch(() => undefined);
  }, intervalMs);

  return {
    async renew() {
      if (failure) throw failure;
      await enqueueRenewal();
      if (failure) throw failure;
    },
    async stop() {
      clearInterval(timer);
      await pending;
      if (failure) throw failure;
    }
  };
}

export async function releaseBootstrapLock(db: D1Database, lock: BootstrapLock): Promise<void> {
  await db
    .prepare("DELETE FROM app_settings WHERE key = ? AND value_json = ?")
    .bind(bootstrapLockKey, lock.value)
    .run();
}
