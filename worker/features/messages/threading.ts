import { newId, nowIso } from "../../db/client";

import { normalizeSubject, parseReferences } from "./headers";

const maxReferenceCandidates = 32;

export async function createThread(
  db: D1Database,
  subject: string,
  lastMessageAt: string
): Promise<string> {
  const id = newId("thr");
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, normalizeSubject(subject), lastMessageAt, timestamp, timestamp)
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
  await db
    .prepare(
      `UPDATE threads
       SET last_message_at = MAX(last_message_at, ?), updated_at = ?
       WHERE id = ?`
    )
    .bind(lastMessageAt, nowIso(), threadId)
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

  const values = candidates.map(() => "(?, ?)").join(", ");
  const bindings = candidates.flatMap((value, priority) => [value, priority]);
  const row = await db
    .prepare(
      `WITH candidates(value, priority) AS (VALUES ${values})
       SELECT messages.thread_id
       FROM candidates
       JOIN messages
         ON messages.message_id = candidates.value OR messages.id = candidates.value
       ORDER BY candidates.priority,
         CASE WHEN messages.mailbox_id IS ? THEN 0 ELSE 1 END,
         COALESCE(messages.received_at, messages.sent_at, messages.created_at) DESC
       LIMIT 1`
    )
    .bind(...bindings, input.mailboxId)
    .first<{ thread_id: string }>();
  return row?.thread_id ?? null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
