import { sql } from "drizzle-orm";

import { getRow, getRows } from "../../db/drizzle";
import { AppError } from "../../lib/errors";

type AttachmentObjectRow = {
  id: string;
  draft_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  content_id: string | null;
  r2_key: string;
};

export async function draftAttachmentRecordExists(
  db: D1Database,
  principalId: string,
  draftId: string,
  id: string,
  r2Key: string
): Promise<boolean> {
  return Boolean(
    await getRow<{ found: number }>(
      db,
      sql`SELECT 1 AS found
          FROM draft_attachments a
          JOIN drafts d ON d.id = a.draft_id
          WHERE a.id = ${id}
            AND a.draft_id = ${draftId}
            AND a.r2_key = ${r2Key}
            AND d.principal_id = ${principalId}`
    )
  );
}

export async function draftAttachmentObjects(
  db: D1Database,
  bucket: R2Bucket,
  principalId: string,
  ids: string[]
): Promise<
  Array<{
    id: string;
    draftId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    contentId: string | null;
    r2Key: string;
    content: ArrayBuffer;
  }>
> {
  if (ids.length === 0) return [];
  const rows = await getRows<AttachmentObjectRow>(
    db,
    sql`SELECT a.id, a.draft_id, a.filename, a.content_type, a.size_bytes, a.content_id, a.r2_key
        FROM draft_attachments a
        JOIN drafts d ON d.id = a.draft_id
        WHERE d.principal_id = ${principalId} AND a.id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `
        )})`
  );
  if (rows.length !== new Set(ids).size)
    throw new AppError("ATTACHMENT_NOT_FOUND", "One or more attachments are unavailable.", 404);
  if (rows.length > 20) {
    throw new AppError(
      "ATTACHMENTS_TOO_MANY",
      "A message may contain at most 20 attachments and inline images.",
      400
    );
  }
  if (rows.reduce((total, row) => total + row.size_bytes, 0) > 25 * 1024 * 1024) {
    throw new AppError("ATTACHMENTS_TOO_LARGE", "Attachments may total at most 25 MiB.", 413);
  }
  return Promise.all(
    rows.map(async (row) => {
      const object = await bucket.get(row.r2_key);
      if (!object)
        throw new AppError("ATTACHMENT_NOT_FOUND", "An attachment object is unavailable.", 404);
      return {
        id: row.id,
        draftId: row.draft_id,
        filename: row.filename,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        contentId: row.content_id,
        r2Key: row.r2_key,
        content: await object.arrayBuffer()
      };
    })
  );
}

export async function draftIdsForAttachmentIds(
  db: D1Database,
  principalId: string,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await getRows<{ id: string; draft_id: string }>(
    db,
    sql`SELECT a.id, a.draft_id FROM draft_attachments a
       JOIN drafts d ON d.id = a.draft_id
       WHERE d.principal_id = ${principalId} AND a.id IN (${sql.join(
         ids.map((id) => sql`${id}`),
         sql`, `
       )})`
  );
  if (rows.length !== new Set(ids).size) {
    throw new AppError("ATTACHMENT_NOT_FOUND", "One or more attachments are unavailable.", 404);
  }
  return [...new Set(rows.map((row) => row.draft_id))];
}
