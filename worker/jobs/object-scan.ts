import { sql } from "drizzle-orm";
import { getRow } from "../db/drizzle";
import { referencedObjectKeys } from "../features/messages/object-references";
import type { WorkerEnv } from "../lib/env";

const pageSize = 1_000;
const orphanGraceMs = 24 * 60 * 60 * 1_000;

export async function scanObjectPage(
  env: WorkerEnv,
  cursor: string | undefined,
  remove: boolean,
  now = Date.now()
) {
  const page = await env.MAIL_OBJECTS.list({ limit: pageSize, ...(cursor ? { cursor } : {}) });
  const candidates = page.objects.filter(
    (object) => !remove || object.uploaded.getTime() < now - orphanGraceMs
  );
  const referenced = await referencedObjectKeys(
    env.DB,
    candidates.map((object) => object.key)
  );
  const orphaned = candidates
    .filter((object) => !referenced.has(object.key))
    .map((object) => object.key);
  if (remove && orphaned.length) await env.MAIL_OBJECTS.delete(orphaned);
  return {
    cursor: page.truncated ? page.cursor : undefined,
    counters: {
      r2ObjectsScanned: page.objects.length,
      [remove ? "removedR2Orphans" : "orphanedR2Objects"]: orphaned.length
    }
  };
}

export async function countObjectReferences(env: WorkerEnv): Promise<Record<string, number>> {
  const row = await getRow<{ raw: number; attachments: number }>(
    env.DB,
    sql`SELECT
    (SELECT COUNT(*) FROM messages WHERE raw_r2_key IS NOT NULL) AS raw,
    (SELECT COUNT(*) FROM message_attachments) AS attachments`
  );
  return { rawReferences: row?.raw ?? 0, attachmentReferences: row?.attachments ?? 0 };
}
