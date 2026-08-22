import { type SQL, sql } from "drizzle-orm";

import { getRow, getRows } from "../../db/drizzle";
import type { WorkerEnv } from "../../lib/env";

import type { MailEventTopic } from "./types";

const workspaceHubName = "workspace";
const publishAttempts = 3;
const publishRetryBaseDelayMs = 100;

export type MailEventScheduler = (promise: Promise<void>) => void;

export type MessageEventTarget = {
  isUnassigned: boolean;
  mailboxId: string | null;
};

export async function publishUserMailEvent(
  env: WorkerEnv,
  userId: string,
  topic: MailEventTopic
): Promise<void> {
  await publishMailEvent(env, [userId], topic);
}

export async function publishMessageMailEvent(
  env: WorkerEnv,
  targets: readonly MessageEventTarget[]
): Promise<void> {
  const userIds = await messageEventUserIds(env.DB, targets);
  await publishMailEvent(env, userIds, "messages");
}

export async function publishMailboxMailEvent(env: WorkerEnv, mailboxId: string): Promise<void> {
  const rows = await getRows<{ id: string }>(
    env.DB,
    sql`SELECT DISTINCT user_row.id
        FROM "user" user_row
        WHERE COALESCE(user_row.banned, 0) = 0
          AND (user_row.role IN ('owner', 'admin') OR EXISTS (
            SELECT 1 FROM mailbox_grants grant_row
            WHERE grant_row.user_id = user_row.id
              AND grant_row.mailbox_id = ${mailboxId}
              AND grant_row.access_level IN ('read', 'agent', 'manager')
          ))`
  );
  await publishMailEvent(
    env,
    rows.map((row) => row.id),
    "mailboxes"
  );
}

export async function messageEventTarget(
  db: D1Database,
  messageId: string
): Promise<MessageEventTarget | null> {
  const row = await getRow<{ is_unassigned: number; mailbox_id: string | null }>(
    db,
    sql`SELECT mailbox_id, is_unassigned FROM messages WHERE id = ${messageId}`
  );
  return row ? { isUnassigned: row.is_unassigned === 1, mailboxId: row.mailbox_id } : null;
}

export function ignoreMailEventFailure(promise: Promise<void>): Promise<void> {
  return promise.catch(() => undefined);
}

export function scheduleMailEvent(schedule: MailEventScheduler, promise: Promise<void>): void {
  schedule(ignoreMailEventFailure(promise));
}

export function scheduleSentMailEvents(
  env: WorkerEnv,
  schedule: MailEventScheduler,
  input: { draftId?: string | null | undefined; mailboxId: string; userId: string }
): void {
  scheduleMailEvent(
    schedule,
    publishMessageMailEvent(env, [{ isUnassigned: false, mailboxId: input.mailboxId }])
  );
  if (input.draftId) {
    scheduleMailEvent(schedule, publishUserMailEvent(env, input.userId, "drafts"));
  }
}

export async function retryMailEventPublish(
  publish: () => Promise<void>,
  wait: (delayMs: number) => Promise<void> = (delayMs) => scheduler.wait(delayMs)
): Promise<void> {
  for (let attempt = 0; attempt < publishAttempts; attempt += 1) {
    try {
      await publish();
      return;
    } catch (error) {
      if (attempt === publishAttempts - 1) throw error;
      await wait(publishRetryBaseDelayMs * 2 ** attempt);
    }
  }
}

async function publishMailEvent(
  env: WorkerEnv,
  userIds: readonly string[],
  topic: MailEventTopic
): Promise<void> {
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return;
  await retryMailEventPublish(() =>
    env.MAIL_EVENTS.getByName(workspaceHubName).publish({
      topic,
      userIds: recipients
    })
  );
}

async function messageEventUserIds(
  db: D1Database,
  targets: readonly MessageEventTarget[]
): Promise<string[]> {
  const mailboxIds = [
    ...new Set(
      targets.flatMap((target) =>
        target.isUnassigned || target.mailboxId === null ? [] : [target.mailboxId]
      )
    )
  ];
  const includeUnassigned = targets.some((target) => target.isUnassigned);
  const visibility: SQL[] = [];
  if (includeUnassigned) visibility.push(sql`user_row.role = 'owner'`);
  if (mailboxIds.length > 0) {
    // Admins can manage mailbox metadata, but mail content still requires a mailbox grant.
    visibility.push(sql`user_row.role = 'owner' OR EXISTS (
      SELECT 1 FROM mailbox_grants grant_row
      WHERE grant_row.user_id = user_row.id
        AND grant_row.mailbox_id IN (${sql.join(
          mailboxIds.map((mailboxId) => sql`${mailboxId}`),
          sql`, `
        )})
        AND grant_row.access_level IN ('read', 'agent', 'manager')
    )`);
  }
  if (visibility.length === 0) return [];

  const rows = await getRows<{ id: string }>(
    db,
    sql`SELECT DISTINCT user_row.id
        FROM "user" user_row
        WHERE COALESCE(user_row.banned, 0) = 0
          AND (${sql.join(visibility, sql` OR `)})`
  );
  return rows.map((row) => row.id);
}
