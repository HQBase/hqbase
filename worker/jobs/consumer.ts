import { and, eq, sql } from "drizzle-orm";
import { nowIso } from "../db/client";
import { createDatabase, getRow } from "../db/drizzle";
import { operationRuns } from "../db/schema";
import type { WorkerEnv } from "../lib/env";
import { operationalLog } from "../observability/log";
import { applyRetention, deleteExpiredRows } from "./maintenance";
import { countObjectReferences, scanObjectPage } from "./object-scan";
import { isJob, type Job } from "./types";

type Progress = { phase: "expiry" | "retention" | "objects"; r2Cursor?: string };
type Operation = {
  status: string;
  cursor: string | null;
  counters_json: string;
  lease_token: string | null;
};
const leaseMs = 5 * 60 * 1_000;

async function processJob(env: WorkerEnv, job: Job): Promise<boolean> {
  const database = createDatabase(env.DB);
  const token = crypto.randomUUID();
  const now = nowIso();
  await database
    .insert(operationRuns)
    .values({
      id: job.id,
      kind: job.kind,
      status: "running",
      counters: {},
      startedAt: now
    })
    .onConflictDoNothing()
    .run();
  const claim = await database
    .update(operationRuns)
    .set({
      status: "running",
      attempts: sql`${operationRuns.attempts} + 1`,
      leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
      errorCode: null,
      finishedAt: null
    })
    .where(
      and(
        eq(operationRuns.id, job.id),
        sql`${operationRuns.status} <> 'succeeded'`,
        sql`(${operationRuns.leaseToken} IS NULL OR ${operationRuns.leaseExpiresAt} <= ${now})`
      )
    )
    .run();
  const row = await getRow<Operation>(
    env.DB,
    sql`SELECT status, cursor, counters_json, lease_token FROM operation_runs WHERE id = ${job.id}`
  );
  if ((claim.meta.changes ?? 0) === 0) return row?.status === "succeeded";
  if (!row || row.lease_token !== token) return false;
  const owned = and(eq(operationRuns.id, job.id), eq(operationRuns.leaseToken, token));
  try {
    const progress: Progress = row.cursor
      ? JSON.parse(row.cursor)
      : { phase: job.kind === "maintenance" ? "expiry" : "objects" };
    const counters: Record<string, number> = JSON.parse(row.counters_json);
    const portion = await runPortion(env, job, progress);
    for (const [key, value] of Object.entries(portion.counters))
      counters[key] = (counters[key] ?? 0) + value;
    const complete = portion.next === null;
    const saved = await database
      .update(operationRuns)
      .set({
        status: complete ? "succeeded" : "running",
        counters,
        cursor: portion.next ? JSON.stringify(portion.next) : null,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: complete ? nowIso() : null
      })
      .where(owned)
      .run();
    if ((saved.meta.changes ?? 0) === 0) return false;
    if (!complete) {
      if (!env.HQBASE_JOBS) throw new Error("HQBASE_JOBS binding is required.");
      await env.HQBASE_JOBS.send(job);
    } else operationalLog("info", "job_succeeded", { jobId: job.id, kind: job.kind });
    return true;
  } catch (error) {
    await database
      .update(operationRuns)
      .set({
        status: "failed",
        errorCode: "JOB_FAILED",
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: nowIso()
      })
      .where(owned)
      .run()
      .catch(() => undefined);
    operationalLog("error", "job_failed", { jobId: job.id, kind: job.kind });
    throw error;
  }
}

async function runPortion(
  env: WorkerEnv,
  job: Job,
  progress: Progress
): Promise<{ next: Progress | null; counters: Record<string, number> }> {
  if (progress.phase === "expiry") {
    const result = await deleteExpiredRows(env, job.requestedAt);
    return { next: { phase: result.more ? "expiry" : "retention" }, counters: result.counters };
  }
  if (progress.phase === "retention") {
    const result = await applyRetention(env, job.requestedAt);
    return { next: { phase: result.more ? "retention" : "objects" }, counters: result.counters };
  }
  const references =
    !progress.r2Cursor && job.kind === "integrity-scan" ? await countObjectReferences(env) : {};
  const page = await scanObjectPage(
    env,
    progress.r2Cursor,
    job.kind === "maintenance",
    Date.parse(job.requestedAt)
  );
  return {
    next: page.cursor ? { phase: "objects", r2Cursor: page.cursor } : null,
    counters: { ...references, ...page.counters }
  };
}

export async function consumeJobs(batch: MessageBatch<Job>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    if (!isJob(message.body)) {
      operationalLog("warn", "job_rejected", { messageId: message.id });
      message.ack();
      continue;
    }
    try {
      if (await processJob(env, message.body)) message.ack();
      else message.retry({ delaySeconds: 60 });
    } catch {
      message.retry();
    }
  }
}

/** One portion; queue consumers use the saved cursor to continue the complete scan. */
export async function removeExpiredOrphanedObjects(
  env: WorkerEnv,
  now = Date.now()
): Promise<number> {
  return (await scanObjectPage(env, undefined, true, now)).counters.removedR2Orphans ?? 0;
}
