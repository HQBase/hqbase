import type { MailboxAccessLevel } from "../../auth/mailbox-access";
import { nowIso } from "../../db/client";

export type MailboxGrant = {
  mailboxId: string;
  userId: string;
  accessLevel: MailboxAccessLevel;
  createdAt: string;
  updatedAt: string;
};

export async function listMailboxGrants(db: D1Database): Promise<MailboxGrant[]> {
  const result = await db
    .prepare(
      `SELECT mailbox_id, user_id, access_level, created_at, updated_at
       FROM mailbox_grants ORDER BY mailbox_id, user_id`
    )
    .all<{
      mailbox_id: string;
      user_id: string;
      access_level: MailboxAccessLevel;
      created_at: string;
      updated_at: string;
    }>();
  return result.results.map((row) => ({
    mailboxId: row.mailbox_id,
    userId: row.user_id,
    accessLevel: row.access_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function setMailboxGrant(
  db: D1Database,
  mailboxId: string,
  userId: string,
  accessLevel: MailboxAccessLevel,
  actorId: string
): Promise<void> {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO mailbox_grants
       (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(mailbox_id, user_id) DO UPDATE SET
         access_level = excluded.access_level,
         created_by = excluded.created_by,
         updated_at = excluded.updated_at`
    )
    .bind(mailboxId, userId, accessLevel, actorId, timestamp, timestamp)
    .run();
}

export async function revokeMailboxGrant(
  db: D1Database,
  mailboxId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM mailbox_grants WHERE mailbox_id = ? AND user_id = ?")
    .bind(mailboxId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function revokeUserMailSessions(_db: D1Database, _userId: string): Promise<void> {
  // Mail-client sessions are not part of the launch product.
}
