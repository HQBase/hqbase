import { newId, nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { appPasswordHash } from "../app-passwords/crypto";

const encoder = new TextEncoder();
const sessionLifetimeMs = 24 * 60 * 60 * 1000;
const sessionRefreshWindowMs = 12 * 60 * 60 * 1000;

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function verifyBridgeToken(request: Request, expected: string): boolean {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return constantTimeEqual(provided, expected);
}

export async function createMailSession(
  env: WorkerEnv,
  userId: string,
  appPasswordId: string
): Promise<string> {
  const id = newId("mss");
  const token = `${id}.${crypto.randomUUID()}${crypto.randomUUID()}`;
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();
  const tokenHash = await appPasswordHash(token, env.PRO_SESSION_SECRET);
  await env.DB.prepare(
    `INSERT INTO pro_mail_sessions
       (id, user_id, app_password_id, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
  )
    .bind(id, userId, appPasswordId, tokenHash, timestamp, expiresAt)
    .run();
  return token;
}

export async function requireMailSession(env: WorkerEnv, request: Request): Promise<string | null> {
  const token = request.headers.get("x-hqbase-mail-session") ?? "";
  if (!token) return null;
  const hash = await appPasswordHash(token, env.PRO_SESSION_SECRET);
  const timestamp = nowIso();
  const row = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.expires_at FROM pro_mail_sessions s
       JOIN pro_app_passwords p ON p.id = s.app_password_id
       JOIN "user" u ON u.id = s.user_id
       JOIN pro_entitlements e ON e.key = 'mail_bridge' AND e.enabled = 1
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
       AND p.revoked_at IS NULL AND (p.expires_at IS NULL OR p.expires_at > ?)
       AND COALESCE(u.banned, 0) = 0`
  )
    .bind(hash, timestamp, timestamp)
    .first<{ id: string; user_id: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now() + sessionRefreshWindowMs) {
    await env.DB.prepare("UPDATE pro_mail_sessions SET expires_at = ? WHERE id = ?")
      .bind(new Date(Date.now() + sessionLifetimeMs).toISOString(), row.id)
      .run();
  }
  return row.user_id;
}
