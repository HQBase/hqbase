import { eq, lt, sql } from "drizzle-orm";

import { nowIso } from "../db/client";
import { createDatabase, getRow, getRows } from "../db/drizzle";
import { messages, operationRuns, rateLimits } from "../db/schema";
import {
  ignoreMailEventFailure,
  type MessageEventTarget,
  publishMessageMailEvent
} from "../features/events/service";
import type { WorkerEnv } from "../lib/env";
import { operationalLog } from "../observability/log";
import { isJob, type Job } from "./types";

const batchSize = 100;
const orphanGraceMs = 24 * 60 * 60 * 1_000;
// ponytail: Persist a cursor if a workspace needs complete sweeps beyond this daily bound.
const r2ObjectScanLimit = 10_000;
const r2PageSize = 1_000;

async function deleteExpiredRows(env: WorkerEnv): Promise<Record<string, number>> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const result = await createDatabase(env.DB)
    .delete(rateLimits)
    .where(lt(rateLimits.expiresAt, nowSeconds))
    .run();
  return {
    rateLimits: result.meta.changes ?? 0
  };
}

async function applyRetention(env: WorkerEnv): Promise<number> {
  const expired = await getRows<{
    id: string;
    is_unassigned: number;
    mailbox_id: string | null;
    raw_r2_key: string | null;
  }>(
    env.DB,
    sql`SELECT m.id, m.mailbox_id, m.is_unassigned, m.raw_r2_key FROM messages m
     JOIN retention_policies p ON p.mailbox_id = m.mailbox_id
     WHERE (m.folder = 'trash'
       AND COALESCE(m.trashed_at, m.updated_at) < datetime('now', '-' || p.trash_days || ' days'))
       OR (p.message_days IS NOT NULL
       AND m.created_at < datetime('now', '-' || p.message_days || ' days'))
     ORDER BY m.created_at, m.id LIMIT ${batchSize}`
  );
  const database = createDatabase(env.DB);
  for (const message of expired) {
    const attachments = await getRows<{ r2_key: string }>(
      env.DB,
      sql`SELECT r2_key FROM message_attachments WHERE message_id = ${message.id}`
    );
    await database.delete(messages).where(eq(messages.id, message.id)).run();
    const candidates = [message.raw_r2_key, ...attachments.map((row) => row.r2_key)].filter(
      (key): key is string => Boolean(key)
    );
    const keys: string[] = [];
    for (const key of candidates) {
      const reference = await hasObjectReference(env.DB, key);
      if (!reference) keys.push(key);
    }
    if (keys.length) await env.MAIL_OBJECTS.delete(keys);
  }
  const targets: MessageEventTarget[] = expired.map((message) => ({
    isUnassigned: message.is_unassigned === 1,
    mailboxId: message.mailbox_id
  }));
  await ignoreMailEventFailure(publishMessageMailEvent(env, targets));
  return expired.length;
}

async function integrityCounters(env: WorkerEnv): Promise<Record<string, number>> {
  const database = await getRow<{ raw_refs: number; attachment_refs: number }>(
    env.DB,
    sql`SELECT
       (SELECT COUNT(*) FROM messages WHERE raw_r2_key IS NOT NULL) AS raw_refs,
       (SELECT COUNT(*) FROM message_attachments) AS attachment_refs`
  );
  let listed = 0;
  let orphaned = 0;
  let cursor: string | undefined;
  do {
    const limit = Math.min(r2PageSize, r2ObjectScanLimit - listed);
    const page = await env.MAIL_OBJECTS.list(cursor ? { cursor, limit } : { limit });
    listed += page.objects.length;
    for (const object of page.objects) {
      const referenced = await hasObjectReference(env.DB, object.key);
      if (!referenced) orphaned += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && listed < r2ObjectScanLimit);
  return {
    rawReferences: database?.raw_refs ?? 0,
    attachmentReferences: database?.attachment_refs ?? 0,
    r2ObjectsScanned: listed,
    orphanedR2Objects: orphaned
  };
}

export async function removeExpiredOrphanedObjects(
  env: WorkerEnv,
  now = Date.now()
): Promise<number> {
  const cutoff = now - orphanGraceMs;
  const orphaned: string[] = [];
  let listed = 0;
  let cursor: string | undefined;
  do {
    const limit = Math.min(r2PageSize, r2ObjectScanLimit - listed);
    const page = await env.MAIL_OBJECTS.list(cursor ? { cursor, limit } : { limit });
    listed += page.objects.length;
    for (const object of page.objects) {
      if (object.uploaded.getTime() >= cutoff) continue;
      const referenced = await hasObjectReference(env.DB, object.key);
      if (!referenced) orphaned.push(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && listed < r2ObjectScanLimit);

  for (let start = 0; start < orphaned.length; start += r2PageSize) {
    await env.MAIL_OBJECTS.delete(orphaned.slice(start, start + r2PageSize));
  }
  return orphaned.length;
}

async function processJob(env: WorkerEnv, job: Job): Promise<void> {
  const startedAt = nowIso();
  const database = createDatabase(env.DB);
  const inserted = await database
    .insert(operationRuns)
    .values({ id: job.id, kind: job.kind, status: "running", counters: {}, startedAt })
    .onConflictDoNothing()
    .run();
  if ((inserted.meta.changes ?? 0) === 0) return;
  try {
    const counters =
      job.kind === "maintenance"
        ? {
            ...(await deleteExpiredRows(env)),
            retainedMessages: await applyRetention(env),
            removedR2Orphans: await removeExpiredOrphanedObjects(env)
          }
        : await integrityCounters(env);
    await database
      .update(operationRuns)
      .set({ status: "succeeded", counters, finishedAt: nowIso() })
      .where(eq(operationRuns.id, job.id))
      .run();
    operationalLog("info", "job_succeeded", { jobId: job.id, kind: job.kind });
  } catch (error) {
    await database
      .update(operationRuns)
      .set({ status: "failed", errorCode: "JOB_FAILED", finishedAt: nowIso() })
      .where(eq(operationRuns.id, job.id))
      .run();
    operationalLog("error", "job_failed", { jobId: job.id, kind: job.kind });
    throw error;
  }
}

function hasObjectReference(db: D1Database, key: string): Promise<unknown | null> {
  return getRow(
    db,
    sql`SELECT 1 FROM messages WHERE raw_r2_key = ${key} OR html_r2_key = ${key}
        UNION ALL SELECT 1 FROM message_attachments WHERE r2_key = ${key}
        UNION ALL SELECT 1 FROM draft_attachments WHERE r2_key = ${key} LIMIT 1`
  );
}

export async function consumeJobs(batch: MessageBatch<Job>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    if (!isJob(message.body)) {
      operationalLog("warn", "job_rejected", { messageId: message.id });
      message.ack();
      continue;
    }
    try {
      await processJob(env, message.body);
      message.ack();
    } catch {
      message.retry();
    }
  }
}
