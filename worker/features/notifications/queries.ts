import { and, eq, inArray, sql } from "drizzle-orm";

import type { MessageScope } from "../../auth/mailbox-access";
import { messageScopeCondition } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { pushSubscriptions } from "../../db/schema";
import type { PushSubscriptionInput, PushSubscriptionRow, UnreadCounts } from "./types";

export async function countUnreadMessages(
  db: D1Database,
  scope: MessageScope
): Promise<UnreadCounts> {
  const scopeCondition = messageScopeCondition(scope, "mailbox_id", "is_unassigned");
  if (!scopeCondition) {
    return { catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 };
  }

  const rows = await getRows<{
    folder: "catchall" | "inbox";
    mailbox_id: string | null;
    unread_count: number;
  }>(
    db,
    sql`SELECT mailbox_id, folder, COUNT(*) AS unread_count
       FROM messages
       WHERE direction = 'inbound'
         AND read_at IS NULL
         AND folder IN ('inbox', 'catchall')
         AND ${scopeCondition}
       GROUP BY mailbox_id, folder`
  );
  const inboxByMailbox: Record<string, number> = {};
  let inbox = 0;
  let catchall = 0;
  for (const row of rows) {
    if (row.folder === "inbox" && row.mailbox_id !== null) {
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
  scope: MessageScope
): Promise<string | null> {
  const scopeCondition = messageScopeCondition(scope, "mailbox_id", "is_unassigned");
  if (!scopeCondition) return null;
  const row = await getRow<{ id: string }>(
    db,
    sql`SELECT id
       FROM messages
       WHERE direction = 'inbound'
         AND ${scopeCondition}
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
  );
  return row?.id ?? null;
}

export async function savePushSubscription(
  db: D1Database,
  userId: string,
  subscription: PushSubscriptionInput
): Promise<void> {
  const timestamp = nowIso();
  await createDatabase(db)
    .insert(pushSubscriptions)
    .values({
      id: newId("push"),
      userId,
      endpoint: subscription.endpoint,
      p256dhKey: subscription.keys.p256dh,
      authKey: subscription.keys.auth,
      expirationTime: subscription.expirationTime,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dhKey: subscription.keys.p256dh,
        authKey: subscription.keys.auth,
        expirationTime: subscription.expirationTime,
        updatedAt: timestamp
      }
    })
    .run();
}

export async function removePushSubscription(
  db: D1Database,
  userId: string,
  endpoint: string
): Promise<void> {
  await createDatabase(db)
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .run();
}

export async function listPushSubscriptionsForMailbox(
  db: D1Database,
  mailboxId: string
): Promise<PushSubscriptionRow[]> {
  return getRows<PushSubscriptionRow>(
    db,
    sql`SELECT subscription.id, subscription.user_id, subscription.endpoint,
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
               AND grant_row.mailbox_id = ${mailboxId}
               AND grant_row.access_level IN ('read', 'agent', 'manager')
           )
         )`
  );
}

/**
 * Unassigned messages have no mailbox grant. This owner-only query is a coarse pre-filter;
 * delivery re-checks each user's live scope before it sends a notification.
 */
export async function listPushSubscriptionsForUnassigned(
  db: D1Database
): Promise<PushSubscriptionRow[]> {
  return getRows<PushSubscriptionRow>(
    db,
    sql`SELECT subscription.id, subscription.user_id, subscription.endpoint,
         subscription.p256dh_key, subscription.auth_key, subscription.expiration_time, user.role
       FROM push_subscriptions subscription
       JOIN "user" user ON user.id = subscription.user_id
       WHERE COALESCE(user.banned, 0) = 0
         AND user.role = 'owner'`
  );
}

export async function markPushSubscriptionSuccessful(db: D1Database, id: string): Promise<void> {
  await createDatabase(db)
    .update(pushSubscriptions)
    .set({ lastSuccessAt: nowIso(), updatedAt: nowIso() })
    .where(eq(pushSubscriptions.id, id))
    .run();
}

export async function removePushSubscriptionsById(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await createDatabase(db)
    .delete(pushSubscriptions)
    .where(inArray(pushSubscriptions.id, ids))
    .run();
}
