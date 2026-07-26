import { nowIso } from "../db/client";
import type { WorkerEnv } from "../lib/env";
import { operationalLog } from "../observability/log";
import { isJob, type Job } from "./types";

const batchSize = 100;

async function deleteExpiredRows(env: WorkerEnv): Promise<Record<string, number>> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(nowSeconds)
  ]);
  return {
    rateLimits: results[0]?.meta.changes ?? 0
  };
}

async function applyRetention(env: WorkerEnv): Promise<number> {
  const expired = await env.DB.prepare(
    `SELECT m.id, m.raw_r2_key FROM messages m
     JOIN retention_policies p ON p.mailbox_id = m.mailbox_id
     WHERE (m.folder = 'trash'
       AND COALESCE(m.trashed_at, m.updated_at) < datetime('now', '-' || p.trash_days || ' days'))
       OR (p.message_days IS NOT NULL
       AND m.created_at < datetime('now', '-' || p.message_days || ' days'))
     ORDER BY m.created_at, m.id LIMIT ?`
  )
    .bind(batchSize)
    .all<{ id: string; raw_r2_key: string | null }>();
  for (const message of expired.results) {
    const attachments = await env.DB.prepare(
      "SELECT r2_key FROM message_attachments WHERE message_id = ?"
    )
      .bind(message.id)
      .all<{ r2_key: string }>();
    await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(message.id).run();
    const candidates = [message.raw_r2_key, ...attachments.results.map((row) => row.r2_key)].filter(
      (key): key is string => Boolean(key)
    );
    const keys: string[] = [];
    for (const key of candidates) {
      const reference = await env.DB.prepare(
        `SELECT 1 FROM messages WHERE raw_r2_key = ? OR html_r2_key = ?
         UNION ALL SELECT 1 FROM message_attachments WHERE r2_key = ? LIMIT 1`
      )
        .bind(key, key, key)
        .first();
      if (!reference) keys.push(key);
    }
    if (keys.length) await env.MAIL_OBJECTS.delete(keys);
  }
  return expired.results.length;
}

async function integrityCounters(env: WorkerEnv): Promise<Record<string, number>> {
  const database = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM messages WHERE raw_r2_key IS NOT NULL) AS raw_refs,
       (SELECT COUNT(*) FROM message_attachments) AS attachment_refs`
  ).first<{ raw_refs: number; attachment_refs: number }>();
  let listed = 0;
  let orphaned = 0;
  let cursor: string | undefined;
  do {
    const page = await env.MAIL_OBJECTS.list(cursor ? { cursor, limit: 1000 } : { limit: 1000 });
    listed += page.objects.length;
    for (const object of page.objects) {
      const referenced = await env.DB.prepare(
        `SELECT 1 FROM messages WHERE raw_r2_key = ? OR html_r2_key = ?
         UNION ALL SELECT 1 FROM message_attachments WHERE r2_key = ? LIMIT 1`
      )
        .bind(object.key, object.key, object.key)
        .first();
      if (!referenced) orphaned += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && listed < 10_000);
  return {
    rawReferences: database?.raw_refs ?? 0,
    attachmentReferences: database?.attachment_refs ?? 0,
    r2ObjectsScanned: listed,
    orphanedR2Objects: orphaned
  };
}

export async function processJob(env: WorkerEnv, job: Job): Promise<void> {
  const startedAt = nowIso();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO operation_runs
     (id, kind, status, counters_json, started_at) VALUES (?, ?, 'running', '{}', ?)`
  )
    .bind(job.id, job.kind, startedAt)
    .run();
  if ((inserted.meta.changes ?? 0) === 0) return;
  try {
    const counters =
      job.kind === "maintenance"
        ? { ...(await deleteExpiredRows(env)), retainedMessages: await applyRetention(env) }
        : await integrityCounters(env);
    await env.DB.prepare(
      `UPDATE operation_runs SET status = 'succeeded', counters_json = ?, finished_at = ?
       WHERE id = ?`
    )
      .bind(JSON.stringify(counters), nowIso(), job.id)
      .run();
    operationalLog("info", "job_succeeded", { jobId: job.id, kind: job.kind });
  } catch (error) {
    await env.DB.prepare(
      `UPDATE operation_runs SET status = 'failed', error_code = ?, finished_at = ? WHERE id = ?`
    )
      .bind("JOB_FAILED", nowIso(), job.id)
      .run();
    operationalLog("error", "job_failed", { jobId: job.id, kind: job.kind });
    throw error;
  }
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
