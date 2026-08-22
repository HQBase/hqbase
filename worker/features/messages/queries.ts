import { and, eq, type SQL, sql } from "drizzle-orm";

import type { MessageScope } from "../../auth/mailbox-access";
import { messageScopeCondition } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { messageAttachments, messages as messagesTable } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { MessageAction } from "./actions";
import { buildMessageActionPatch } from "./actions";
import { decodeKeysetCursor, encodeKeysetCursor, type KeysetCursor } from "./keyset-cursor";
import { literalSearchPattern } from "./search";
import type {
  AttachmentRow,
  InsertAttachmentInput,
  InsertMessageInput,
  MessageDetail,
  MessageRow,
  MessageSummary,
  StoredAttachment
} from "./types";

const messageSelect = sql`SELECT messages.*,
  (SELECT address FROM mailbox_addresses
   WHERE id = messages.delivered_to_address_id) AS delivered_to_address
  FROM messages`;

/** Message cursors are versioned separately from conversation cursors. */
const messageCursorVersion = "m1";
export const defaultMessageLimit = 100;
export const maxMessageLimit = 100;

export type ListMessageFilters = {
  cursor?: string | undefined;
  folder?: string | undefined;
  limit?: number | undefined;
  mailboxId?: string | undefined;
  search?: string | undefined;
  scope: MessageScope;
};

export type MessagePage = {
  messages: MessageSummary[];
  nextCursor: string | null;
};

function decodeMessageCursor(value: string): KeysetCursor {
  const cursor = decodeKeysetCursor(messageCursorVersion, value);
  if (!cursor) {
    throw new AppError("INVALID_CURSOR", "Message cursor is invalid.", 400);
  }
  return cursor;
}

export async function insertMessage(
  db: D1Database,
  input: InsertMessageInput
): Promise<MessageSummary> {
  const id = newId("msg");
  const timestamp = nowIso();

  await createDatabase(db)
    .insert(messagesTable)
    .values({
      id,
      threadId: input.threadId,
      mailboxId: input.mailboxId,
      isUnassigned: input.isUnassigned,
      direction: input.direction,
      folder: input.folder,
      fromAddress: input.fromAddress,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      snippet: input.snippet,
      textBody: input.textBody,
      htmlR2Key: input.htmlR2Key,
      rawR2Key: input.rawR2Key,
      messageId: input.messageId,
      dedupeKey: input.dedupeKey,
      inReplyTo: input.inReplyTo,
      references: input.references,
      receivedAt: input.receivedAt,
      sentAt: input.sentAt,
      readAt: input.readAt,
      hasAttachments: input.hasAttachments,
      createdAt: timestamp,
      updatedAt: timestamp,
      deliveredToAddressId: input.deliveredToAddressId ?? null,
      sentFromAddressId: input.sentFromAddressId ?? null
    })
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
  await createDatabase(db)
    .insert(messageAttachments)
    .values({
      id,
      messageId: input.messageId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      contentId: input.contentId,
      r2Key: input.r2Key,
      createdAt: timestamp
    })
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
  return (await listMessagePage(db, filters)).messages;
}

export async function listMessagePage(
  db: D1Database,
  filters: ListMessageFilters
): Promise<MessagePage> {
  const where: SQL[] = [];

  // The access filter is applied first and is never relaxed by a cursor.
  const scope = messageScopeCondition(filters.scope, "mailbox_id", "is_unassigned");
  if (!scope) return { messages: [], nextCursor: null };
  where.push(scope);

  if (filters.folder) {
    where.push(sql`folder = ${filters.folder}`);
  }
  if (filters.mailboxId) {
    where.push(sql`mailbox_id = ${filters.mailboxId}`);
  }
  if (filters.search) {
    const like = literalSearchPattern(filters.search);
    where.push(
      sql`(subject LIKE ${like} ESCAPE '\\' OR from_address LIKE ${like} ESCAPE '\\'
           OR to_json LIKE ${like} ESCAPE '\\' OR snippet LIKE ${like} ESCAPE '\\'
           OR text_body LIKE ${like} ESCAPE '\\')`
    );
  }

  const cursor = filters.cursor ? decodeMessageCursor(filters.cursor) : null;
  if (cursor) {
    where.push(
      sql`(COALESCE(received_at, sent_at, created_at) < ${cursor.activityAt}
           OR (COALESCE(received_at, sent_at, created_at) = ${cursor.activityAt}
               AND messages.id < ${cursor.id}))`
    );
  }

  const limit = Math.min(Math.max(filters.limit ?? defaultMessageLimit, 1), maxMessageLimit);
  // Read one extra row to learn whether another page exists.
  const result = await getRows<MessageRow>(
    db,
    sql`${messageSelect}
        WHERE ${sql.join(where, sql` AND `)}
        ORDER BY COALESCE(received_at, sent_at, created_at) DESC, messages.id DESC
        LIMIT ${limit + 1}`
  );

  const pageRows = result.slice(0, limit);
  const finalRow = pageRows.at(-1);
  return {
    messages: pageRows.map(mapMessageSummary),
    nextCursor:
      result.length > limit && finalRow
        ? encodeKeysetCursor(messageCursorVersion, {
            activityAt: messageActivityOf(finalRow),
            id: finalRow.id
          })
        : null
  };
}

function messageActivityOf(row: MessageRow): string {
  return row.received_at ?? row.sent_at ?? row.created_at;
}

export async function getMessageDetail(db: D1Database, id: string): Promise<MessageDetail | null> {
  const row = await getMessageRow(db, id);
  if (!row) {
    return null;
  }

  return mapMessageDetail(db, row);
}

export async function listThreadMessages(
  db: D1Database,
  threadId: string,
  scope: MessageScope
): Promise<MessageDetail[]> {
  const scopeCondition = messageScopeCondition(scope, "mailbox_id", "is_unassigned");
  if (!scopeCondition) return [];
  const rows = await getRows<MessageRow>(
    db,
    sql`${messageSelect}
       WHERE thread_id = ${threadId} AND ${scopeCondition}
       ORDER BY COALESCE(received_at, sent_at, created_at) ASC
       LIMIT 100`
  );
  return Promise.all(rows.map((row) => mapMessageDetail(db, row)));
}

async function mapMessageDetail(db: D1Database, row: MessageRow): Promise<MessageDetail> {
  return {
    ...mapMessageSummary(row),
    cc: parseJsonList(row.cc_json),
    bcc: parseJsonList(row.bcc_json),
    deliveredToAddress: row.delivered_to_address,
    textBody: row.text_body,
    htmlAvailable: row.html_r2_key !== null,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    references: parseJsonList(row.references_json),
    attachments: await listAttachments(db, row.id)
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
  if (
    (action === "unarchive" && current.folder !== "archived") ||
    (action === "restore" && current.folder !== "trash")
  ) {
    return mapMessageSummary(current);
  }

  const timestamp = nowIso();
  const patch = buildMessageActionPatch(action, timestamp, {
    direction: current.direction,
    isUnassigned: current.is_unassigned === 1
  });
  const expectedFolder =
    action === "unarchive" ? "archived" : action === "restore" ? "trash" : null;
  await createDatabase(db)
    .update(messagesTable)
    .set({
      folder: patch.folder,
      readAt: patch.readAt,
      starredAt: patch.starredAt,
      archivedAt: patch.archivedAt,
      trashedAt: patch.trashedAt,
      updatedAt: timestamp
    })
    .where(
      expectedFolder
        ? and(eq(messagesTable.id, id), eq(messagesTable.folder, expectedFolder))
        : eq(messagesTable.id, id)
    )
    .run();

  const row = await getMessageRow(db, id);
  if (!row) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  return mapMessageSummary(row);
}

export async function findAttachment(db: D1Database, id: string): Promise<StoredAttachment | null> {
  const row = await getRow<AttachmentRow>(
    db,
    sql`SELECT * FROM message_attachments WHERE id = ${id}`
  );

  return row ? mapAttachment(row) : null;
}

export async function getMessageHtmlKey(db: D1Database, id: string): Promise<string | null> {
  const row = await getRow<{ html_r2_key: string | null }>(
    db,
    sql`SELECT html_r2_key FROM messages WHERE id = ${id}`
  );
  return row?.html_r2_key ?? null;
}

async function getMessageRow(db: D1Database, id: string): Promise<MessageRow | null> {
  return getRow<MessageRow>(db, sql`${messageSelect} WHERE messages.id = ${id}`);
}

async function listAttachments(db: D1Database, messageId: string): Promise<StoredAttachment[]> {
  const rows = await getRows<AttachmentRow>(
    db,
    sql`SELECT * FROM message_attachments
        WHERE message_id = ${messageId}
        ORDER BY filename ASC`
  );

  return rows.map(mapAttachment);
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
