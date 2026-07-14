import { newId, nowIso } from "../../db/client";
import { AppError } from "../../lib/errors";
import type { MessageAction } from "./actions";
import { buildMessageActionPatch } from "./actions";
import { normalizeSubject } from "./headers";
import type {
  AttachmentRow,
  InsertAttachmentInput,
  InsertMessageInput,
  MessageDetail,
  MessageRow,
  MessageSummary,
  StoredAttachment
} from "./types";

export type ListMessageFilters = {
  folder?: string | undefined;
  mailboxId?: string | undefined;
  search?: string | undefined;
};

export async function ensureThread(
  db: D1Database,
  subject: string,
  timestamp: string
): Promise<string> {
  const subjectNormalized = normalizeSubject(subject);
  const existing = await db
    .prepare("SELECT id FROM threads WHERE subject_normalized = ? LIMIT 1")
    .bind(subjectNormalized)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare("UPDATE threads SET last_message_at = ?, updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, existing.id)
      .run();
    return existing.id;
  }

  const id = newId("thr");
  await db
    .prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, subjectNormalized, timestamp, timestamp, timestamp)
    .run();
  return id;
}

export async function insertMessage(
  db: D1Database,
  input: InsertMessageInput
): Promise<MessageSummary> {
  const id = newId("msg");
  const timestamp = nowIso();

  await db
    .prepare(
      `INSERT INTO messages (
        id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
        subject, snippet, text_body, html_r2_key, raw_r2_key, message_id, dedupe_key,
        in_reply_to, references_json, received_at, sent_at, read_at, has_attachments,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.threadId,
      input.mailboxId,
      input.direction,
      input.folder,
      input.fromAddress,
      JSON.stringify(input.to),
      JSON.stringify(input.cc),
      JSON.stringify(input.bcc),
      input.subject,
      input.snippet,
      input.textBody,
      input.htmlR2Key,
      input.rawR2Key,
      input.messageId,
      input.dedupeKey,
      input.inReplyTo,
      JSON.stringify(input.references),
      input.receivedAt,
      input.sentAt,
      input.readAt,
      input.hasAttachments ? 1 : 0,
      timestamp,
      timestamp
    )
    .run();

  const row = await getMessageRow(db, id);
  if (!row) {
    throw new AppError("MESSAGE_INSERT_FAILED", "Message could not be stored.", 500);
  }
  return mapMessageSummary(row);
}

export async function insertAttachment(
  db: D1Database,
  input: InsertAttachmentInput
): Promise<StoredAttachment> {
  const id = newId("att");
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO message_attachments
       (id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.messageId,
      input.filename,
      input.contentType,
      input.sizeBytes,
      input.contentId,
      input.r2Key,
      timestamp
    )
    .run();

  return {
    id,
    messageId: input.messageId,
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    contentId: input.contentId,
    r2Key: input.r2Key,
    createdAt: timestamp
  };
}

export async function listMessages(
  db: D1Database,
  filters: ListMessageFilters
): Promise<MessageSummary[]> {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.folder) {
    where.push("folder = ?");
    params.push(filters.folder);
  }
  if (filters.mailboxId) {
    where.push("mailbox_id = ?");
    params.push(filters.mailboxId);
  }
  if (filters.search) {
    where.push(
      "(subject LIKE ? OR from_address LIKE ? OR to_json LIKE ? OR snippet LIKE ? OR text_body LIKE ?)"
    );
    const like = `%${filters.search}%`;
    params.push(like, like, like, like, like);
  }

  const sql = `SELECT * FROM messages ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY COALESCE(received_at, sent_at, created_at) DESC LIMIT 100`;

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<MessageRow>();

  return result.results.map(mapMessageSummary);
}

export async function getMessageDetail(db: D1Database, id: string): Promise<MessageDetail | null> {
  const row = await getMessageRow(db, id);
  if (!row) {
    return null;
  }

  return {
    ...mapMessageSummary(row),
    cc: parseJsonList(row.cc_json),
    bcc: parseJsonList(row.bcc_json),
    textBody: row.text_body,
    htmlAvailable: row.html_r2_key !== null,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    references: parseJsonList(row.references_json),
    attachments: await listAttachments(db, id)
  };
}

export async function updateMessageAction(
  db: D1Database,
  id: string,
  action: MessageAction
): Promise<MessageSummary> {
  const current = await getMessageRow(db, id);
  if (!current) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }

  const timestamp = nowIso();
  const patch = buildMessageActionPatch(action, timestamp);
  await db
    .prepare(
      `UPDATE messages
       SET folder = ?, read_at = ?, starred_at = ?, archived_at = ?, trashed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      patch.folder ?? current.folder,
      patch.readAt === undefined ? current.read_at : patch.readAt,
      patch.starredAt === undefined ? current.starred_at : patch.starredAt,
      patch.archivedAt === undefined ? current.archived_at : patch.archivedAt,
      patch.trashedAt === undefined ? current.trashed_at : patch.trashedAt,
      timestamp,
      id
    )
    .run();

  const row = await getMessageRow(db, id);
  if (!row) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  return mapMessageSummary(row);
}

export async function findAttachment(db: D1Database, id: string): Promise<StoredAttachment | null> {
  const row = await db
    .prepare("SELECT * FROM message_attachments WHERE id = ?")
    .bind(id)
    .first<AttachmentRow>();

  return row ? mapAttachment(row) : null;
}

export async function getMessageHtmlKey(db: D1Database, id: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT html_r2_key FROM messages WHERE id = ?")
    .bind(id)
    .first<{ html_r2_key: string | null }>();
  return row?.html_r2_key ?? null;
}

async function getMessageRow(db: D1Database, id: string): Promise<MessageRow | null> {
  return db.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<MessageRow>();
}

async function listAttachments(db: D1Database, messageId: string): Promise<StoredAttachment[]> {
  const result = await db
    .prepare("SELECT * FROM message_attachments WHERE message_id = ? ORDER BY filename ASC")
    .bind(messageId)
    .all<AttachmentRow>();

  return result.results.map(mapAttachment);
}

export function mapMessageSummary(row: MessageRow): MessageSummary {
  return {
    id: row.id,
    threadId: row.thread_id,
    mailboxId: row.mailbox_id,
    direction: row.direction,
    folder: row.folder,
    fromAddress: row.from_address,
    to: parseJsonList(row.to_json),
    subject: row.subject,
    snippet: row.snippet,
    receivedAt: row.received_at,
    sentAt: row.sent_at,
    readAt: row.read_at,
    starredAt: row.starred_at,
    hasAttachments: row.has_attachments === 1,
    createdAt: row.created_at
  };
}

function mapAttachment(row: AttachmentRow): StoredAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    contentId: row.content_id,
    r2Key: row.r2_key,
    createdAt: row.created_at
  };
}

function parseJsonList(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}
