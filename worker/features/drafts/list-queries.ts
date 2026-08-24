import { type SQL, sql } from "drizzle-orm";

import { getRows } from "../../db/drizzle";
import { AppError } from "../../lib/errors";
import { decodeKeysetCursor, encodeKeysetCursor } from "../messages/keyset-cursor";
import { literalSearchPattern } from "../messages/search";
import { attachmentsForDrafts, type DraftRow, mapAttachment, mapDraftRow } from "./queries";
import type { Draft, DraftAttachment } from "./types";

const draftCursorVersion = "d1";
export const defaultDraftLimit = 100;
export const maxDraftLimit = 100;

export type DraftPage = {
  drafts: Draft[];
  nextCursor: string | null;
};

function decodeDraftCursor(value: string) {
  const cursor = decodeKeysetCursor(draftCursorVersion, value);
  if (!cursor) throw new AppError("INVALID_DRAFT_CURSOR", "Draft cursor is invalid.", 400);
  return { id: cursor.id, updatedAt: cursor.activityAt };
}

export async function listDraftPage(
  db: D1Database,
  principalId: string,
  input: {
    cursor?: string | undefined;
    limit?: number | undefined;
    search?: string | undefined;
  } = {}
): Promise<DraftPage> {
  const where: SQL[] = [sql`principal_id = ${principalId}`];
  if (input.search) {
    const like = literalSearchPattern(input.search);
    where.push(sql`(
      subject LIKE ${like} ESCAPE '\\'
      OR from_address LIKE ${like} ESCAPE '\\'
      OR to_json LIKE ${like} ESCAPE '\\'
      OR cc_json LIKE ${like} ESCAPE '\\'
      OR bcc_json LIKE ${like} ESCAPE '\\'
      OR text_body LIKE ${like} ESCAPE '\\'
    )`);
  }
  const cursor = input.cursor ? decodeDraftCursor(input.cursor) : null;
  if (cursor) {
    where.push(
      sql`(updated_at < ${cursor.updatedAt}
           OR (updated_at = ${cursor.updatedAt} AND id < ${cursor.id}))`
    );
  }
  const limit = Math.min(Math.max(input.limit ?? defaultDraftLimit, 1), maxDraftLimit);
  const rows = await getRows<DraftRow>(
    db,
    sql`SELECT * FROM drafts
        WHERE ${sql.join(where, sql` AND `)}
        ORDER BY updated_at DESC, id DESC
        LIMIT ${limit + 1}`
  );
  const pageRows = rows.slice(0, limit);
  const drafts = await mapDraftRows(db, pageRows);
  const finalRow = pageRows.at(-1);
  return {
    drafts,
    nextCursor:
      rows.length > limit && finalRow
        ? encodeKeysetCursor(draftCursorVersion, {
            activityAt: finalRow.updated_at,
            id: finalRow.id
          })
        : null
  };
}

export async function getDraftsByIds(
  db: D1Database,
  principalId: string,
  ids: string[]
): Promise<Draft[]> {
  if (ids.length === 0) return [];
  const rows: DraftRow[] = [];
  for (let index = 0; index < ids.length; index += 99) {
    const batch = ids.slice(index, index + 99);
    rows.push(
      ...(await getRows<DraftRow>(
        db,
        sql`SELECT * FROM drafts
            WHERE principal_id = ${principalId}
              AND id IN (${sql.join(
                batch.map((id) => sql`${id}`),
                sql`, `
              )})`
      ))
    );
  }
  return mapDraftRows(db, rows);
}

async function mapDraftRows(db: D1Database, rows: DraftRow[]): Promise<Draft[]> {
  const attachmentRows = await attachmentsForDrafts(
    db,
    rows.map((row) => row.id)
  );
  const attachmentsByDraft = new Map<string, DraftAttachment[]>();
  for (const row of attachmentRows) {
    const values = attachmentsByDraft.get(row.draft_id) ?? [];
    values.push(mapAttachment(row));
    attachmentsByDraft.set(row.draft_id, values);
  }
  return rows.map((row) => mapDraftRow(row, attachmentsByDraft.get(row.id) ?? []));
}
