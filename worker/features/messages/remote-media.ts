import { nowIso } from "../../db/client";

export async function isRemoteMediaTrusted(
  db: D1Database,
  userId: string,
  senderAddress: string
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT load_remote_media FROM message_sender_preferences
       WHERE user_id = ? AND sender_address = ?`
    )
    .bind(userId, normalizeSenderAddress(senderAddress))
    .first<{ load_remote_media: number }>();
  return row?.load_remote_media === 1;
}

export async function trustRemoteMediaSender(
  db: D1Database,
  userId: string,
  senderAddress: string
): Promise<void> {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO message_sender_preferences
       (user_id, sender_address, load_remote_media, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(user_id, sender_address) DO UPDATE SET
         load_remote_media = 1, updated_at = excluded.updated_at`
    )
    .bind(userId, normalizeSenderAddress(senderAddress), timestamp, timestamp)
    .run();
}

export function normalizeSenderAddress(value: string): string {
  return value.trim().toLowerCase();
}
