import { sql } from "drizzle-orm";

import type { MessageScope } from "../../auth/mailbox-access";
import { messageScopeCondition } from "../../auth/mailbox-access";
import { getRow, getRows } from "../../db/drizzle";
import { AppError } from "../../lib/errors";

import {
  type ChangeCursor,
  compareChangeSequences,
  decodeChangeCursor,
  encodeChangeCursor
} from "./change-cursor";
import { mapMessageSummary } from "./queries";
import type { MessageRow, MessageSummary } from "./types";

export const defaultChangeLimit = 100;
export const maxChangeLimit = 100;

export type MessageChange =
  | { type: "upsert"; message: MessageSummary }
  | { type: "delete"; messageId: string; mailboxId: string | null };

export type MessageChangePage = {
  changes: MessageChange[];
  nextCursor: string;
  hasMore: boolean;
};

type JournalRow = {
  sequence: string;
  message_id: string;
  mailbox_id: string | null;
  is_unassigned: number;
  kind: "upsert" | "delete";
};

export async function listMessageChanges(
  db: D1Database,
  input: { cursor?: string | undefined; limit: number; scope: MessageScope }
): Promise<MessageChangePage> {
  const currentHighWater = await getCurrentHighWater(db);
  if (!input.cursor) {
    return emptyPage({ after: currentHighWater, highWater: null });
  }

  const cursor = decodeChangeCursor(input.cursor);
  validateCursorBounds(cursor, currentHighWater);
  const highWater = cursor.highWater ?? currentHighWater;
  const scope = messageScopeCondition(input.scope, "mailbox_id", "is_unassigned");
  if (!scope || compareChangeSequences(cursor.after, highWater) === 0) {
    return emptyPage({ after: highWater, highWater: null });
  }

  const journal = await getRows<JournalRow>(
    db,
    sql`SELECT CAST(sequence AS TEXT) AS sequence, message_id, mailbox_id, is_unassigned, kind
       FROM message_changes
       WHERE sequence > CAST(${cursor.after} AS INTEGER)
         AND sequence <= CAST(${highWater} AS INTEGER)
         AND ${scope}
       ORDER BY sequence ASC
       LIMIT ${input.limit + 1}`
  );

  const pageRows = journal.slice(0, input.limit);
  const hasMore = journal.length > input.limit;
  const messages = await currentMessages(db, pageRows);
  const changes = pageRows.flatMap<MessageChange>((row) => {
    if (row.kind === "delete") {
      return [{ type: "delete", messageId: row.message_id, mailboxId: row.mailbox_id }];
    }
    const message = messages.get(row.message_id);
    return message?.mailbox_id === row.mailbox_id && message.is_unassigned === row.is_unassigned
      ? [{ type: "upsert", message: mapMessageSummary(message) }]
      : [];
  });

  const finalRow = pageRows.at(-1);
  const nextCursor =
    hasMore && finalRow
      ? encodeChangeCursor({ after: finalRow.sequence, highWater })
      : encodeChangeCursor({ after: highWater, highWater: null });
  return { changes, nextCursor, hasMore };
}

async function getCurrentHighWater(db: D1Database): Promise<string> {
  const row = await getRow<{ sequence: string }>(
    db,
    sql`SELECT CAST(COALESCE(MAX(sequence), 0) AS TEXT) AS sequence FROM message_changes`
  );
  return row?.sequence ?? "0";
}

async function currentMessages(
  db: D1Database,
  rows: JournalRow[]
): Promise<Map<string, MessageRow>> {
  const ids = [
    ...new Set(rows.filter((row) => row.kind === "upsert").map((row) => row.message_id))
  ];
  if (ids.length === 0) return new Map();
  const messages = await getRows<MessageRow>(
    db,
    sql`SELECT messages.*,
          (SELECT address FROM mailbox_addresses
           WHERE id = messages.delivered_to_address_id) AS delivered_to_address
        FROM messages
        WHERE messages.id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `
        )})`
  );
  return new Map(messages.map((row) => [row.id, row]));
}

function validateCursorBounds(cursor: ChangeCursor, currentHighWater: string): void {
  if (
    compareChangeSequences(cursor.after, currentHighWater) > 0 ||
    (cursor.highWater !== null && compareChangeSequences(cursor.highWater, currentHighWater) > 0)
  ) {
    throw new AppError("INVALID_CHANGE_CURSOR", "Change cursor is invalid.", 400);
  }
}

function emptyPage(cursor: ChangeCursor): MessageChangePage {
  return { changes: [], nextCursor: encodeChangeCursor(cursor), hasMore: false };
}
