import { and, eq, ne, sql } from "drizzle-orm";

import type { MessageScope } from "../../auth/mailbox-access";
import { messageScopeCondition, messageScopeSql } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { labels } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { MessageEventTarget } from "../events/service";

export const labelColors = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink"
] as const;

export type LabelColor = (typeof labelColors)[number];

export type MailLabel = {
  color: LabelColor;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
};

type LabelRow = {
  color: LabelColor;
  created_at: string;
  id: string;
  name: string;
  updated_at: string;
};

export async function listLabels(db: D1Database): Promise<MailLabel[]> {
  const rows = await getRows<LabelRow>(
    db,
    sql`SELECT id, name, color, created_at, updated_at
        FROM labels ORDER BY name COLLATE NOCASE ASC, id ASC`
  );
  return rows.map(mailLabel);
}

export async function requireLabel(db: D1Database, id: string): Promise<MailLabel> {
  const row = await labelRow(db, id);
  if (!row) throw new AppError("LABEL_NOT_FOUND", "Label not found.", 404);
  return mailLabel(row);
}

export async function createLabel(
  db: D1Database,
  input: { color: LabelColor; name: string; userId: string }
): Promise<MailLabel> {
  await assertLabelNameAvailable(db, input.name);
  const timestamp = nowIso();
  const id = newId("lbl");
  try {
    await createDatabase(db)
      .insert(labels)
      .values({
        color: input.color,
        createdAt: timestamp,
        createdByUserId: input.userId,
        id,
        name: input.name,
        updatedAt: timestamp
      })
      .run();
  } catch (error) {
    throw labelWriteError(error);
  }
  return requireLabel(db, id);
}

export async function updateLabel(
  db: D1Database,
  id: string,
  input: { color?: LabelColor | undefined; name?: string | undefined }
): Promise<MailLabel> {
  await requireLabel(db, id);
  if (input.name !== undefined) await assertLabelNameAvailable(db, input.name, id);
  try {
    await createDatabase(db)
      .update(labels)
      .set({ ...input, updatedAt: nowIso() })
      .where(eq(labels.id, id))
      .run();
  } catch (error) {
    throw labelWriteError(error);
  }
  return requireLabel(db, id);
}

export async function deleteLabel(db: D1Database, id: string): Promise<void> {
  const result = await createDatabase(db).delete(labels).where(eq(labels.id, id)).run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new AppError("LABEL_NOT_FOUND", "Label not found.", 404);
  }
}

export async function labelsForMessageIds(
  db: D1Database,
  messageIds: readonly string[]
): Promise<Map<string, MailLabel[]>> {
  if (messageIds.length === 0) return new Map();
  const rows = await getRows<LabelRow & { message_id: string }>(
    db,
    sql`SELECT assignment.message_id, label.id, label.name, label.color,
          label.created_at, label.updated_at
        FROM message_labels assignment
        JOIN labels label ON label.id = assignment.label_id
        WHERE assignment.message_id IN (${sql.join(
          messageIds.map((id) => sql`${id}`),
          sql`, `
        )})
        ORDER BY label.name COLLATE NOCASE ASC, label.id ASC`
  );
  return groupedLabels(rows, "message_id");
}

export async function labelsForDraftIds(
  db: D1Database,
  draftIds: readonly string[]
): Promise<Map<string, MailLabel[]>> {
  if (draftIds.length === 0) return new Map();
  const rows = await getRows<LabelRow & { draft_id: string }>(
    db,
    sql`SELECT assignment.draft_id, label.id, label.name, label.color,
          label.created_at, label.updated_at
        FROM draft_labels assignment
        JOIN labels label ON label.id = assignment.label_id
        WHERE assignment.draft_id IN (${sql.join(
          draftIds.map((id) => sql`${id}`),
          sql`, `
        )})
        ORDER BY label.name COLLATE NOCASE ASC, label.id ASC`
  );
  return groupedLabels(rows, "draft_id");
}

export async function labelsForThreadIds(
  db: D1Database,
  threadIds: readonly string[],
  scope: MessageScope
): Promise<Map<string, MailLabel[]>> {
  if (threadIds.length === 0) return new Map();
  const access = messageScopeCondition(scope, "message.mailbox_id", "message.is_unassigned");
  if (!access) return new Map();
  const rows = await getRows<LabelRow & { thread_id: string }>(
    db,
    sql`SELECT DISTINCT message.thread_id, label.id, label.name, label.color,
          label.created_at, label.updated_at
        FROM messages message
        JOIN message_labels assignment ON assignment.message_id = message.id
        JOIN labels label ON label.id = assignment.label_id
        WHERE ${access}
          AND message.thread_id IN (${sql.join(
            threadIds.map((id) => sql`${id}`),
            sql`, `
          )})
        ORDER BY label.name COLLATE NOCASE ASC, label.id ASC`
  );
  return groupedLabels(rows, "thread_id");
}

export async function withMessageLabels<T extends { id: string }>(
  db: D1Database,
  messages: readonly T[]
): Promise<Array<T & { labels: MailLabel[] }>> {
  const assigned = await labelsForMessageIds(
    db,
    messages.map((message) => message.id)
  );
  return messages.map((message) => ({ ...message, labels: assigned.get(message.id) ?? [] }));
}

export async function withConversationLabels<T extends { threadId: string }>(
  db: D1Database,
  conversations: readonly T[],
  scope: MessageScope
): Promise<Array<T & { labels: MailLabel[] }>> {
  const assigned = await labelsForThreadIds(
    db,
    conversations.map((conversation) => conversation.threadId),
    scope
  );
  return conversations.map((conversation) => ({
    ...conversation,
    labels: assigned.get(conversation.threadId) ?? []
  }));
}

export async function setMessageLabel(
  db: D1Database,
  input: { assigned: boolean; labelId: string; messageId: string; principalId: string }
): Promise<{ affected: number; eventTargets: MessageEventTarget[] }> {
  const timestamp = nowIso();
  const mutation = input.assigned
    ? db
        .prepare(
          `INSERT OR IGNORE INTO message_labels
           (message_id, label_id, assigned_by_principal_id, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .bind(input.messageId, input.labelId, input.principalId, timestamp)
    : db
        .prepare("DELETE FROM message_labels WHERE message_id = ? AND label_id = ?")
        .bind(input.messageId, input.labelId);
  const [result] = await db.batch([
    mutation,
    db.prepare("UPDATE messages SET updated_at = ? WHERE id = ?").bind(timestamp, input.messageId)
  ]);
  const target = await getRow<{ is_unassigned: number; mailbox_id: string | null }>(
    db,
    sql`SELECT mailbox_id, is_unassigned FROM messages WHERE id = ${input.messageId}`
  );
  return {
    affected: result?.meta.changes ?? 0,
    eventTargets: target
      ? [{ isUnassigned: target.is_unassigned === 1, mailboxId: target.mailbox_id }]
      : []
  };
}

export async function setDraftLabel(
  db: D1Database,
  input: { assigned: boolean; draftId: string; labelId: string; principalId: string }
): Promise<{ affected: number; labels: MailLabel[] }> {
  const mutation = input.assigned
    ? db
        .prepare(
          `INSERT OR IGNORE INTO draft_labels
           (draft_id, label_id, assigned_by_principal_id, created_at)
           SELECT id, ?, ?, ? FROM drafts WHERE id = ? AND principal_id = ?
           RETURNING draft_id`
        )
        .bind(input.labelId, input.principalId, nowIso(), input.draftId, input.principalId)
    : db
        .prepare(
          `DELETE FROM draft_labels
           WHERE draft_id = ? AND label_id = ?
             AND EXISTS (
               SELECT 1 FROM drafts
               WHERE id = draft_labels.draft_id AND principal_id = ?
             )
           RETURNING draft_id`
        )
        .bind(input.draftId, input.labelId, input.principalId);
  const result = await mutation.all<{ draft_id: string }>();
  const assigned = await labelsForDraftIds(db, [input.draftId]);
  return {
    affected: result.results.length,
    labels: assigned.get(input.draftId) ?? []
  };
}

export async function setConversationLabel(
  db: D1Database,
  input: {
    assigned: boolean;
    labelId: string;
    messageId: string;
    principalId: string;
    scope: MessageScope;
  }
): Promise<{
  affected: number;
  eventTargets: MessageEventTarget[];
  threadId: string;
}> {
  const access = messageScopeSql(input.scope, "mailbox_id", "is_unassigned");
  if (!access) throw new AppError("LABEL_FORBIDDEN", "You cannot label this conversation.", 403);
  const selected = await db
    .prepare(`SELECT thread_id FROM messages WHERE id = ? AND ${access.sql}`)
    .bind(input.messageId, ...access.params)
    .first<{ thread_id: string }>();
  if (!selected) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);

  const timestamp = nowIso();
  const mutation = input.assigned
    ? db
        .prepare(
          `INSERT OR IGNORE INTO message_labels
           (message_id, label_id, assigned_by_principal_id, created_at)
           SELECT id, ?, ?, ? FROM messages WHERE thread_id = ? AND ${access.sql}`
        )
        .bind(input.labelId, input.principalId, timestamp, selected.thread_id, ...access.params)
    : db
        .prepare(
          `DELETE FROM message_labels WHERE label_id = ? AND message_id IN (
             SELECT id FROM messages WHERE thread_id = ? AND ${access.sql}
           )`
        )
        .bind(input.labelId, selected.thread_id, ...access.params);
  const [result] = await db.batch([
    mutation,
    db
      .prepare(`UPDATE messages SET updated_at = ? WHERE thread_id = ? AND ${access.sql}`)
      .bind(timestamp, selected.thread_id, ...access.params)
  ]);
  const targets = await db
    .prepare(`SELECT mailbox_id, is_unassigned FROM messages WHERE thread_id = ? AND ${access.sql}`)
    .bind(selected.thread_id, ...access.params)
    .all<{ is_unassigned: number; mailbox_id: string | null }>();
  return {
    affected: result?.meta.changes ?? 0,
    eventTargets: targets.results.map((target) => ({
      isUnassigned: target.is_unassigned === 1,
      mailboxId: target.mailbox_id
    })),
    threadId: selected.thread_id
  };
}

async function labelRow(db: D1Database, id: string): Promise<LabelRow | null> {
  return getRow<LabelRow>(
    db,
    sql`SELECT id, name, color, created_at, updated_at FROM labels WHERE id = ${id}`
  );
}

async function assertLabelNameAvailable(
  db: D1Database,
  name: string,
  exceptId?: string
): Promise<void> {
  const condition = exceptId
    ? and(eq(labels.name, name), ne(labels.id, exceptId))
    : eq(labels.name, name);
  const existing = await createDatabase(db)
    .select({ id: labels.id })
    .from(labels)
    .where(condition)
    .get();
  if (existing) {
    throw new AppError("LABEL_NAME_CONFLICT", "A label with this name already exists.", 409);
  }
}

function groupedLabels<Row extends LabelRow, Key extends keyof Row & string>(
  rows: Row[],
  key: Key
): Map<string, MailLabel[]> {
  const result = new Map<string, MailLabel[]>();
  for (const row of rows) {
    const id = String(row[key]);
    result.set(id, [...(result.get(id) ?? []), mailLabel(row)]);
  }
  return result;
}

function mailLabel(row: LabelRow): MailLabel {
  return {
    color: row.color,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at
  };
}

function labelWriteError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && /UNIQUE constraint failed/iu.test(error.message)) {
    return new AppError("LABEL_NAME_CONFLICT", "A label with this name already exists.", 409);
  }
  return new AppError("LABEL_INVALID", "Label could not be saved.", 400);
}
