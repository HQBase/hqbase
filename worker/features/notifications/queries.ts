import { newId, nowIso } from "../../db/client";
import type { PushSubscriptionInput, PushSubscriptionRow, UnreadCounts } from "./types";

export async function countUnreadMessages(
  db: D1Database,
  mailboxIds: string[]
): Promise<UnreadCounts> {
  if (mailboxIds.length === 0) {
    return { catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 };
  }

  const result = await db
    .prepare(
      `SELECT mailbox_id, folder, COUNT(*) AS unread_count
       FROM messages
       WHERE direction = 'inbound'
         AND read_at IS NULL
         AND folder IN ('inbox', 'catchall')
         AND mailbox_id IN (${mailboxIds.map(() => "?").join(", ")})
       GROUP BY mailbox_id, folder`
    )
    .bind(...mailboxIds)
    .all<{ folder: "catchall" | "inbox"; mailbox_id: string; unread_count: number }>();
  const inboxByMailbox: Record<string, number> = {};
  let inbox = 0;
  let catchall = 0;
  for (const row of result.results) {
    if (row.folder === "inbox") {
      inbox += row.unread_count;
      inboxByMailbox[row.mailbox_id] = row.unread_count;
    } else {
      catchall += row.unread_count;
    }
  }
  return { catchall, inbox, inboxByMailbox, total: inbox + catchall };
}

export async function latestInboundMessageId(
  db: D1Database,
  mailboxIds: string[]
): Promise<string | null> {
  if (mailboxIds.length === 0) return null;
  const row = await db
    .prepare(
      `SELECT id
       FROM messages
       WHERE direction = 'inbound'
         AND mailbox_id IN (${mailboxIds.map(() => "?").join(", ")})
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    )
    .bind(...mailboxIds)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function savePushSubscription(
  db: D1Database,
  userId: string,
  subscription: PushSubscriptionInput
): Promise<void> {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO push_subscriptions (
         id, user_id, endpoint, p256dh_key, auth_key, expiration_time, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh_key = excluded.p256dh_key,
         auth_key = excluded.auth_key,
         expiration_time = excluded.expiration_time,
         updated_at = excluded.updated_at`
    )
    .bind(
      newId("push"),
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      subscription.expirationTime,
      timestamp,
      timestamp
    )
    .run();
}

export async function removePushSubscription(
  db: D1Database,
  userId: string,
  endpoint: string
): Promise<void> {
  await db
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
    .bind(userId, endpoint)
    .run();
}

export async function listPushSubscriptionsForMailbox(
  db: D1Database,
  mailboxId: string
): Promise<PushSubscriptionRow[]> {
  const result = await db
    .prepare(
      `SELECT subscription.id, subscription.user_id, subscription.endpoint,
         subscription.p256dh_key, subscription.auth_key, subscription.expiration_time, user.role
       FROM push_subscriptions subscription
       JOIN "user" user ON user.id = subscription.user_id
       WHERE COALESCE(user.banned, 0) = 0
         AND (
           user.role = 'owner'
           OR EXISTS (
             SELECT 1
             FROM mailbox_grants grant_row
             WHERE grant_row.user_id = subscription.user_id
               AND grant_row.mailbox_id = ?
               AND grant_row.access_level IN ('read', 'agent', 'manager')
           )
         )`
    )
    .bind(mailboxId)
    .all<PushSubscriptionRow>();
  return result.results;
}

export async function markPushSubscriptionSuccessful(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE push_subscriptions SET last_success_at = ?, updated_at = ? WHERE id = ?")
    .bind(nowIso(), nowIso(), id)
    .run();
}

export async function removePushSubscriptionsById(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .prepare(`DELETE FROM push_subscriptions WHERE id IN (${ids.map(() => "?").join(", ")})`)
    .bind(...ids)
    .run();
}
