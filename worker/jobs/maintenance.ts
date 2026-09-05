import { sql } from "drizzle-orm";
import { getRows } from "../db/drizzle";
import { ignoreMailEventFailure, publishMessageMailEvent } from "../features/events/service";
import { referencedObjectKeys } from "../features/messages/object-references";
import type { WorkerEnv } from "../lib/env";

export const defaultTrashDays = 30;
const batchSize = 100;

export async function deleteExpiredRows(env: WorkerEnv, now: string) {
  const oldOperations = new Date(Date.parse(now) - 90 * 24 * 60 * 60 * 1000).toISOString();
  const statements = [
    env.DB.prepare(
      "DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE expires_at < ? LIMIT ?)"
    ).bind(Math.floor(Date.parse(now) / 1000), batchSize),
    env.DB.prepare(
      'DELETE FROM "session" WHERE id IN (SELECT id FROM "session" WHERE "expiresAt" < ? LIMIT ?)'
    ).bind(now, batchSize),
    env.DB.prepare(
      'DELETE FROM verification WHERE id IN (SELECT id FROM verification WHERE "expiresAt" < ? LIMIT ?)'
    ).bind(now, batchSize),
    env.DB.prepare(
      "DELETE FROM operation_runs WHERE id IN (SELECT id FROM operation_runs WHERE status = 'succeeded' AND finished_at < ? LIMIT ?)"
    ).bind(oldOperations, batchSize)
  ];
  const results = await env.DB.batch(statements);
  const names = ["rateLimits", "expiredSessions", "expiredVerifications", "oldOperations"];
  const counters = Object.fromEntries(
    results.map((result, index) => [names[index], result.meta.changes ?? 0])
  );
  return { more: results.some((result) => (result.meta.changes ?? 0) === batchSize), counters };
}

export async function applyRetention(env: WorkerEnv, now: string) {
  const expired = await getRows<{
    id: string;
    is_unassigned: number;
    mailbox_id: string | null;
    raw_r2_key: string | null;
    html_r2_key: string | null;
    text_r2_key: string | null;
  }>(
    env.DB,
    sql`SELECT m.id, m.mailbox_id, m.is_unassigned, m.raw_r2_key, m.html_r2_key, m.text_r2_key
    FROM messages m LEFT JOIN retention_policies p ON p.mailbox_id = m.mailbox_id
    WHERE (m.folder = 'trash' AND julianday(COALESCE(m.trashed_at, m.updated_at)) < julianday(${now}) - COALESCE(p.trash_days, ${defaultTrashDays}))
      OR (p.message_days IS NOT NULL AND julianday(m.created_at) < julianday(${now}) - p.message_days)
    ORDER BY m.created_at, m.id LIMIT ${batchSize}`
  );
  if (!expired.length) return { more: false, counters: { retainedMessages: 0 } };
  const ids = JSON.stringify(expired.map((message) => message.id));
  const attachments = await getRows<{ r2_key: string }>(
    env.DB,
    sql`
    SELECT r2_key FROM message_attachments WHERE message_id IN (SELECT value FROM json_each(${ids}))`
  );
  // Check inside the write so a concurrent restore is not deleted by an old read.
  const removed =
    await env.DB.prepare(`DELETE FROM messages WHERE id IN (SELECT value FROM json_each(?))
    AND ((folder = 'trash' AND julianday(COALESCE(trashed_at, updated_at)) < julianday(?) - COALESCE(
      (SELECT trash_days FROM retention_policies WHERE mailbox_id = messages.mailbox_id), ?))
    OR julianday(created_at) < julianday(?) - (SELECT message_days FROM retention_policies WHERE mailbox_id = messages.mailbox_id))`)
      .bind(ids, now, defaultTrashDays, now)
      .run();
  const keys = [
    ...new Set(
      [
        ...expired.flatMap((message) => [
          message.raw_r2_key,
          message.html_r2_key,
          message.text_r2_key
        ]),
        ...attachments.map((attachment) => attachment.r2_key)
      ].filter((key): key is string => Boolean(key))
    )
  ];
  for (let start = 0; start < keys.length; start += 1_000) {
    const portion = keys.slice(start, start + 1_000);
    const referenced = await referencedObjectKeys(env.DB, portion);
    const unused = portion.filter((key) => !referenced.has(key));
    if (unused.length) await env.MAIL_OBJECTS.delete(unused);
  }
  await ignoreMailEventFailure(
    publishMessageMailEvent(
      env,
      expired.map((message) => ({
        isUnassigned: message.is_unassigned === 1,
        mailboxId: message.mailbox_id
      }))
    )
  );
  return {
    more: expired.length === batchSize,
    counters: { retainedMessages: removed.meta.changes ?? 0 }
  };
}
