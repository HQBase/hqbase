import { nowIso } from "../../db/client";

export async function getDefaultFromMailboxId(
  db: D1Database,
  userId: string
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT default_from_mailbox_id
       FROM user_mail_preferences
       WHERE user_id = ?`
    )
    .bind(userId)
    .first<{ default_from_mailbox_id: string | null }>();
  return row?.default_from_mailbox_id ?? null;
}

export async function setDefaultFromMailboxId(
  db: D1Database,
  userId: string,
  mailboxId: string
): Promise<void> {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO user_mail_preferences
       (user_id, default_from_mailbox_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         default_from_mailbox_id = excluded.default_from_mailbox_id,
         updated_at = excluded.updated_at`
    )
    .bind(userId, mailboxId, timestamp, timestamp)
    .run();
}
