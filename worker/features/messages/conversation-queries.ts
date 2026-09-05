import { and, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";

import type { MessageScope } from "../../auth/mailbox-access";
import { messageScopeCondition } from "../../auth/mailbox-access";
import { nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { messages } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { MessageEventTarget } from "../events/service";

import type { MessageAction } from "./actions";
import { decodeKeysetCursor, encodeKeysetCursor, type KeysetCursor } from "./keyset-cursor";
import { literalContains } from "./search";
import type {
  ConversationFolder,
  ConversationPage,
  ConversationRow,
  ConversationSummary,
  MessageFolder
} from "./types";

/** Conversation cursors keep version 1. Message cursors use a different version tag. */
const conversationCursorVersion = 1;

export type ListConversationFilters = {
  correspondentEmail?: string | undefined;
  cursor?: string | undefined;
  folder?: ConversationFolder | undefined;
  limit?: number | undefined;
  labelId?: string | undefined;
  labelIds?: readonly string[] | undefined;
  mailboxId?: string | undefined;
  scope: MessageScope;
  search?: string | undefined;
};

export async function listConversations(
  db: D1Database,
  filters: ListConversationFilters
): Promise<ConversationSummary[]> {
  const page = await listConversationPage(db, {
    ...filters,
    limit: filters.limit ?? 100
  });
  return page.conversations;
}

export async function listConversationPage(
  db: D1Database,
  filters: ListConversationFilters
): Promise<ConversationPage> {
  const scope = messageScopeCondition(
    filters.scope,
    "messages.mailbox_id",
    "messages.is_unassigned"
  );
  if (!scope) {
    return {
      conversations: [],
      nextCursor: null,
      totalCount: filters.cursor ? null : 0
    };
  }
  const visibility =
    filters.folder === "trash" ? sql`messages.folder = 'trash'` : sql`messages.folder <> 'trash'`;

  const eligibilityWhere: SQL[] = [];
  if (filters.mailboxId) {
    eligibilityWhere.push(sql`accessible.mailbox_id = ${filters.mailboxId}`);
  }
  if (filters.folder === "starred") {
    eligibilityWhere.push(sql`accessible.starred_at IS NOT NULL`);
  } else if (filters.folder) {
    eligibilityWhere.push(sql`accessible.folder = ${filters.folder}`);
  }
  if (filters.search) {
    eligibilityWhere.push(
      sql`(${literalContains(sql`accessible.subject`, filters.search)}
           OR ${literalContains(sql`accessible.from_address`, filters.search)}
           OR ${literalContains(sql`accessible.from_name`, filters.search)}
           OR ${literalContains(sql`accessible.to_json`, filters.search)}
           OR ${literalContains(sql`accessible.snippet`, filters.search)}
           OR ${literalContains(sql`accessible.text_body`, filters.search)})`
    );
  }
  if (filters.correspondentEmail) {
    eligibilityWhere.push(sql`(
      lower(accessible.from_address) = ${filters.correspondentEmail}
      OR EXISTS (
        SELECT 1 FROM json_each(accessible.to_json) recipient
        WHERE lower(trim(CAST(recipient.value AS TEXT))) = ${filters.correspondentEmail}
      )
      OR EXISTS (
        SELECT 1 FROM json_each(accessible.cc_json) recipient
        WHERE lower(trim(CAST(recipient.value AS TEXT))) = ${filters.correspondentEmail}
      )
      OR EXISTS (
        SELECT 1 FROM json_each(accessible.bcc_json) recipient
        WHERE lower(trim(CAST(recipient.value AS TEXT))) = ${filters.correspondentEmail}
      )
    )`);
  }
  const labelIds = filters.labelIds ?? (filters.labelId ? [filters.labelId] : []);
  for (const labelId of labelIds) {
    eligibilityWhere.push(sql`EXISTS (
      SELECT 1
      FROM accessible labeled
      JOIN message_labels assignment ON assignment.message_id = labeled.id
      WHERE labeled.thread_id = accessible.thread_id AND assignment.label_id = ${labelId}
    )`);
  }

  const cursor = filters.cursor ? decodeConversationCursor(filters.cursor) : null;
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const eligibilityCondition =
    eligibilityWhere.length > 0 ? sql`WHERE ${sql.join(eligibilityWhere, sql` AND `)}` : sql``;
  const cursorCondition = cursor
    ? sql`AND (
        ranked.activity_at < ${cursor.activityAt}
        OR (ranked.activity_at = ${cursor.activityAt} AND ranked.id < ${cursor.id})
      )`
    : sql``;
  const rows = await getRows<ConversationRow>(
    db,
    sql`WITH accessible AS (
         SELECT messages.id, messages.thread_id, messages.mailbox_id, messages.direction,
           messages.folder, messages.from_address, messages.from_name, messages.to_json,
           messages.subject, messages.snippet, messages.received_at, messages.sent_at,
           messages.created_at, messages.read_at, messages.starred_at, messages.has_attachments,
           ${filters.search ? sql`messages.text_body` : sql`NULL`} AS text_body,
           ${filters.correspondentEmail ? sql`messages.cc_json` : sql`NULL`} AS cc_json,
           ${filters.correspondentEmail ? sql`messages.bcc_json` : sql`NULL`} AS bcc_json,
           COALESCE(messages.received_at, messages.sent_at, messages.created_at) AS activity_at
         FROM messages
         WHERE ${scope} AND ${visibility}
       ),
       eligible_threads AS (
         SELECT DISTINCT accessible.thread_id
         FROM accessible
         ${eligibilityCondition}
       ),
       ranked AS (
         SELECT accessible.*,
           ROW_NUMBER() OVER (
             PARTITION BY accessible.thread_id
             ORDER BY accessible.activity_at DESC, accessible.id DESC
           ) AS thread_position
         FROM accessible
         JOIN eligible_threads ON eligible_threads.thread_id = accessible.thread_id
       ),
       aggregates AS (
         SELECT accessible.thread_id,
           COUNT(*) AS message_count,
           SUM(
             CASE WHEN accessible.direction = 'inbound' AND accessible.read_at IS NULL
               THEN 1 ELSE 0 END
           ) AS unread_count,
           MAX(CASE WHEN accessible.starred_at IS NOT NULL THEN 1 ELSE 0 END) AS is_starred,
           MAX(accessible.has_attachments) AS has_thread_attachments
         FROM accessible
         JOIN eligible_threads ON eligible_threads.thread_id = accessible.thread_id
         GROUP BY accessible.thread_id
       )
       SELECT ranked.*, aggregates.message_count, aggregates.unread_count,
         aggregates.is_starred, aggregates.has_thread_attachments,
         ${cursor ? sql`NULL` : sql`COUNT(*) OVER ()`} AS total_count
       FROM ranked
       JOIN aggregates ON aggregates.thread_id = ranked.thread_id
       WHERE ranked.thread_position = 1
       ${cursorCondition}
       ORDER BY ranked.activity_at DESC, ranked.id DESC
       LIMIT ${limit + 1}`
  );

  const pageRows = rows.slice(0, limit);
  const finalRow = pageRows.at(-1);
  return {
    conversations: pageRows.map(mapConversationSummary),
    nextCursor:
      rows.length > limit && finalRow
        ? encodeConversationCursor({ activityAt: finalRow.activity_at, id: finalRow.id })
        : null,
    totalCount: cursor ? null : (pageRows[0]?.total_count ?? 0)
  };
}

export async function updateConversationAction(
  db: D1Database,
  input: {
    action: MessageAction;
    activeFolder: ConversationFolder;
    messageId: string;
    scope: MessageScope;
  }
): Promise<{
  affected: number;
  eventTargets: MessageEventTarget[];
  threadId: string;
}> {
  const scope = messageScopeCondition(input.scope, "mailbox_id", "is_unassigned");
  if (!scope) {
    throw new AppError("MAILBOX_FORBIDDEN", "You do not have access to this mailbox.", 403);
  }
  const selected = await getRow<{ thread_id: string }>(
    db,
    sql`SELECT thread_id FROM messages WHERE id = ${input.messageId} AND ${scope}`
  );
  if (!selected) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }

  const timestamp = nowIso();
  const conditions: SQL[] = [eq(messages.threadId, selected.thread_id), scope];
  const restoredFolder = sql.raw(`CASE
    WHEN mailbox_id IS NULL THEN 'catchall'
    WHEN direction = 'outbound' THEN 'sent'
    ELSE 'inbox'
  END`);
  const set: {
    archivedAt?: string | null;
    folder?: MessageFolder | SQL;
    readAt?: string | null;
    starredAt?: string | null;
    trashedAt?: string | null;
    updatedAt: string;
  } = { updatedAt: timestamp };

  switch (input.action) {
    case "read":
      set.readAt = timestamp;
      conditions.push(eq(messages.direction, "inbound"));
      break;
    case "unread":
      set.readAt = null;
      conditions.push(eq(messages.direction, "inbound"));
      break;
    case "star":
      set.starredAt = timestamp;
      break;
    case "unstar":
      set.starredAt = null;
      break;
    case "archive":
      set.folder = "archived";
      set.archivedAt = timestamp;
      conditions.push(inArray(messages.folder, ["inbox", "catchall"]));
      break;
    case "unarchive":
      set.folder = restoredFolder;
      set.archivedAt = null;
      set.trashedAt = null;
      conditions.push(eq(messages.folder, "archived"));
      if (input.activeFolder !== "archived") conditions.push(sql`1 = 0`);
      break;
    case "trash":
      set.folder = "trash";
      set.trashedAt = timestamp;
      if (input.activeFolder === "starred") {
        conditions.push(isNotNull(messages.starredAt));
      } else {
        conditions.push(eq(messages.folder, input.activeFolder));
      }
      break;
    case "restore":
      set.folder = restoredFolder;
      set.archivedAt = null;
      set.trashedAt = null;
      conditions.push(eq(messages.folder, "trash"));
      if (input.activeFolder !== "trash") conditions.push(sql`1 = 0`);
      break;
  }

  const result = await createDatabase(db)
    .update(messages)
    .set(set)
    .where(and(...conditions))
    .returning({ isUnassigned: messages.isUnassigned, mailboxId: messages.mailboxId });
  return {
    affected: result.length,
    eventTargets: result.map((row) => ({
      isUnassigned: row.isUnassigned,
      mailboxId: row.mailboxId
    })),
    threadId: selected.thread_id
  };
}

function mapConversationSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    threadId: row.thread_id,
    mailboxId: row.mailbox_id,
    direction: row.direction,
    folder: row.folder,
    fromAddress: row.from_address,
    fromName: row.from_name,
    to: parseJsonList(row.to_json),
    subject: row.subject,
    snippet: row.snippet,
    receivedAt: row.received_at,
    sentAt: row.sent_at,
    readAt: row.read_at,
    starredAt: row.starred_at,
    hasAttachments: row.has_thread_attachments === 1,
    createdAt: row.created_at,
    isStarred: row.is_starred === 1,
    messageCount: row.message_count,
    unreadCount: row.unread_count
  };
}

function encodeConversationCursor(cursor: KeysetCursor): string {
  return encodeKeysetCursor(conversationCursorVersion, cursor);
}

function decodeConversationCursor(value: string): KeysetCursor {
  const cursor = decodeKeysetCursor(conversationCursorVersion, value);
  if (!cursor) {
    throw new AppError("INVALID_CONVERSATION_CURSOR", "Conversation cursor is invalid.", 400);
  }
  return cursor;
}

function parseJsonList(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}
