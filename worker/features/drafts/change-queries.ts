import { sql } from "drizzle-orm";

import { getRow, getRows } from "../../db/drizzle";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { type DraftPrincipal, draftPrincipalId, filterAccessibleDrafts } from "./access";
import {
  compareDraftChangeSequences,
  type DraftChangeCursor,
  decodeDraftChangeCursor,
  encodeDraftChangeCursor
} from "./change-cursor";
import { getDraftsByIds } from "./list-queries";
import type { Draft } from "./types";

export const defaultDraftChangeLimit = 100;
export const maxDraftChangeLimit = 100;

type DraftChange = { type: "upsert"; draft: Draft } | { type: "delete"; draftId: string };

export type DraftChangePage = {
  changes: DraftChange[];
  nextCursor: string;
  hasMore: boolean;
};

type DraftJournalRow = {
  sequence: string;
  draft_id: string;
  kind: "upsert" | "delete";
};

export async function listDraftChanges(
  env: WorkerEnv,
  principal: DraftPrincipal,
  input: { cursor?: string | undefined; limit: number }
): Promise<DraftChangePage> {
  const principalId = draftPrincipalId(principal);
  const currentHighWater = await getCurrentHighWater(env.DB, principalId);
  if (!input.cursor) {
    return emptyPage({ after: currentHighWater, highWater: null, principalId });
  }

  const cursor = decodeDraftChangeCursor(input.cursor, principalId);
  validateCursorBounds(cursor, currentHighWater);
  const highWater = cursor.highWater ?? currentHighWater;
  if (compareDraftChangeSequences(cursor.after, highWater) === 0) {
    return emptyPage({ after: highWater, highWater: null, principalId });
  }

  const journal = await getRows<DraftJournalRow>(
    env.DB,
    sql`SELECT CAST(sequence AS TEXT) AS sequence, draft_id, kind
        FROM draft_changes
        WHERE principal_id = ${principalId}
          AND sequence > CAST(${cursor.after} AS INTEGER)
          AND sequence <= CAST(${highWater} AS INTEGER)
        ORDER BY sequence ASC
        LIMIT ${input.limit + 1}`
  );
  const pageRows = journal.slice(0, input.limit);
  const hasMore = journal.length > input.limit;
  const current = await getDraftsByIds(env.DB, principalId, [
    ...new Set(pageRows.filter((row) => row.kind === "upsert").map((row) => row.draft_id))
  ]);
  const accessible = await filterAccessibleDrafts(env, principal, current);
  const drafts = new Map(accessible.map((draft) => [draft.id, draft]));
  const changes = pageRows.flatMap<DraftChange>((row) => {
    if (row.kind === "delete") return [{ type: "delete", draftId: row.draft_id }];
    const draft = drafts.get(row.draft_id);
    return draft ? [{ type: "upsert", draft }] : [];
  });

  const finalRow = pageRows.at(-1);
  const nextCursor =
    hasMore && finalRow
      ? encodeDraftChangeCursor({
          after: finalRow.sequence,
          highWater,
          principalId
        })
      : encodeDraftChangeCursor({
          after: highWater,
          highWater: null,
          principalId
        });
  return { changes, nextCursor, hasMore };
}

async function getCurrentHighWater(db: D1Database, principalId: string): Promise<string> {
  const row = await getRow<{ sequence: string }>(
    db,
    sql`SELECT CAST(COALESCE(MAX(sequence), 0) AS TEXT) AS sequence
        FROM draft_changes WHERE principal_id = ${principalId}`
  );
  return row?.sequence ?? "0";
}

function validateCursorBounds(cursor: DraftChangeCursor, currentHighWater: string): void {
  if (
    compareDraftChangeSequences(cursor.after, currentHighWater) > 0 ||
    (cursor.highWater !== null &&
      compareDraftChangeSequences(cursor.highWater, currentHighWater) > 0)
  ) {
    throw new AppError("INVALID_DRAFT_CHANGE_CURSOR", "Draft change cursor is invalid.", 400);
  }
}

function emptyPage(cursor: DraftChangeCursor): DraftChangePage {
  return { changes: [], nextCursor: encodeDraftChangeCursor(cursor), hasMore: false };
}
