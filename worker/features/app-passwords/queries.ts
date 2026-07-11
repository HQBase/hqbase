import { newId, nowIso } from "../../db/client";
import type { WorkspaceRole } from "../../lib/validation";
import { appPasswordHash, appPasswordId, createAppPassword, secureHashEqual } from "./crypto";
import type { AppPassword, AppPasswordRow } from "./types";

function publicPassword(row: AppPasswordRow): AppPassword {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at
  };
}

export async function listAppPasswords(db: D1Database, userId: string): Promise<AppPassword[]> {
  const rows = await db
    .prepare("SELECT * FROM pro_app_passwords WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<AppPasswordRow>();
  return rows.results.map(publicPassword);
}

export async function insertAppPassword(
  db: D1Database,
  userId: string,
  name: string,
  pepper: string,
  expiresAt: string | null = null
): Promise<{ appPassword: AppPassword; password: string }> {
  const id = newId("apw");
  const password = createAppPassword(id);
  const timestamp = nowIso();
  const hash = await appPasswordHash(password, pepper);
  const row: AppPasswordRow = {
    id,
    user_id: userId,
    name,
    secret_hash: hash,
    created_at: timestamp,
    last_used_at: null,
    expires_at: expiresAt,
    revoked_at: null
  };
  await db
    .prepare(
      `INSERT INTO pro_app_passwords
       (id, user_id, name, secret_hash, created_at, last_used_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)`
    )
    .bind(id, userId, name, hash, timestamp, expiresAt)
    .run();
  return { appPassword: publicPassword(row), password };
}

export async function revokeAppPassword(
  db: D1Database,
  userId: string,
  id: string
): Promise<boolean> {
  const timestamp = nowIso();
  const result = await db.batch([
    db
      .prepare(
        "UPDATE pro_app_passwords SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
      )
      .bind(timestamp, id, userId),
    db
      .prepare(
        "UPDATE pro_mail_sessions SET revoked_at = ? WHERE app_password_id = ? AND revoked_at IS NULL"
      )
      .bind(timestamp, id)
  ]);
  return (result[0]?.meta.changes ?? 0) > 0;
}

export async function verifyAppPassword(
  db: D1Database,
  email: string,
  password: string,
  pepper: string
): Promise<{ appPasswordId: string; userId: string; role: WorkspaceRole } | null> {
  const id = appPasswordId(password);
  if (!id) return null;
  const row = await db
    .prepare(
      `SELECT p.*, u.role AS user_role FROM pro_app_passwords p
       JOIN "user" u ON u.id = p.user_id
       JOIN pro_entitlements e ON e.key = 'mail_bridge' AND e.enabled = 1
       WHERE p.id = ? AND lower(u.email) = lower(?) AND p.revoked_at IS NULL
       AND (p.expires_at IS NULL OR p.expires_at > ?)`
    )
    .bind(id, email, nowIso())
    .first<AppPasswordRow & { user_role: WorkspaceRole }>();
  if (!row) return null;
  const expected = await appPasswordHash(password, pepper);
  if (!secureHashEqual(expected, row.secret_hash)) return null;
  await db
    .prepare("UPDATE pro_app_passwords SET last_used_at = ? WHERE id = ?")
    .bind(nowIso(), id)
    .run();
  return { appPasswordId: id, userId: row.user_id, role: row.user_role };
}
