import { eq, sql } from "drizzle-orm";

import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow } from "../../db/drizzle";
import { threads } from "../../db/schema";

import { normalizeSubject, parseReferences } from "./headers";

const maxReferenceCandidates = 32;

export async function createThread(
  db: D1Database,
  subject: string,
  lastMessageAt: string
): Promise<string> {
  const id = newId("thr");
  const timestamp = nowIso();
  await createDatabase(db)
    .insert(threads)
    .values({
      id,
      subjectNormalized: normalizeSubject(subject),
      lastMessageAt,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .run();
  return id;
}

export async function resolveInboundThread(
  db: D1Database,
  input: {
    inReplyTo: string | null;
    lastMessageAt: string;
    mailboxId: string | null;
    references: string[];
    subject: string;
  }
): Promise<string> {
  const existing = await findReferencedThread(db, input);
  if (!existing) {
    return createThread(db, input.subject, input.lastMessageAt);
  }

  await touchThread(db, existing, input.lastMessageAt);
  return existing;
}

export async function touchThread(
  db: D1Database,
  threadId: string,
  lastMessageAt: string
): Promise<void> {
  await createDatabase(db)
    .update(threads)
    .set({
      lastMessageAt: sql`MAX(${threads.lastMessageAt}, ${lastMessageAt})`,
      updatedAt: nowIso()
    })
    .where(eq(threads.id, threadId))
    .run();
}

async function findReferencedThread(
  db: D1Database,
  input: {
    inReplyTo: string | null;
    mailboxId: string | null;
    references: string[];
  }
): Promise<string | null> {
  const candidates = unique([
    ...parseReferences(input.inReplyTo),
    ...[...input.references].reverse()
  ]).slice(0, maxReferenceCandidates);
  if (candidates.length === 0) {
    return null;
  }

  const values = candidates.map((value, priority) => sql`(${value}, ${priority})`);
  const row = await getRow<{ thread_id: string }>(
    db,
    sql`WITH candidates(value, priority) AS (VALUES ${sql.join(values, sql`, `)})
       SELECT messages.thread_id
       FROM candidates
       JOIN messages
         ON messages.message_id = candidates.value OR messages.id = candidates.value
       ORDER BY candidates.priority,
         CASE WHEN messages.mailbox_id IS ${input.mailboxId} THEN 0 ELSE 1 END,
         COALESCE(messages.received_at, messages.sent_at, messages.created_at) DESC
       LIMIT 1`
  );
  return row?.thread_id ?? null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
