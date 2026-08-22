import { and, eq, sql } from "drizzle-orm";

import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { draftAttachments, drafts } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { Draft, DraftAttachment } from "./types";

type DraftRow = {
  id: string;
  mailbox_id: string | null;
  reply_to_message_id: string | null;
  forward_of_message_id: string | null;
  from_address: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  subject: string;
  text_body: string;
  html_body: string;
  version: number;
  updated_at: string;
};
type AttachmentRow = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  r2_key: string;
};
const parse = (value: string): string[] => {
  try {
    const result: unknown = JSON.parse(value);
    return Array.isArray(result)
      ? result.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};
const mapAttachment = (row: AttachmentRow): DraftAttachment => ({
  id: row.id,
  filename: row.filename,
  contentType: row.content_type,
  sizeBytes: row.size_bytes
});

async function attachments(db: D1Database, draftId: string) {
  return getRows<AttachmentRow>(
    db,
    sql`SELECT id, filename, content_type, size_bytes, r2_key
        FROM draft_attachments
        WHERE draft_id = ${draftId}
        ORDER BY created_at`
  );
}
async function mapDraft(db: D1Database, row: DraftRow): Promise<Draft> {
  return {
    id: row.id,
    mailboxId: row.mailbox_id,
    replyToMessageId: row.reply_to_message_id,
    forwardOfMessageId: row.forward_of_message_id,
    from: row.from_address,
    to: parse(row.to_json),
    cc: parse(row.cc_json),
    bcc: parse(row.bcc_json),
    subject: row.subject,
    text: row.text_body,
    html: row.html_body,
    version: row.version,
    updatedAt: row.updated_at,
    attachments: (await attachments(db, row.id)).map(mapAttachment)
  };
}
export async function listDrafts(db: D1Database, userId: string): Promise<Draft[]> {
  const rows = await getRows<DraftRow>(
    db,
    sql`SELECT * FROM drafts WHERE user_id = ${userId} ORDER BY updated_at DESC`
  );
  return Promise.all(rows.map((row) => mapDraft(db, row)));
}
export async function getDraft(db: D1Database, userId: string, id: string): Promise<Draft | null> {
  const row = await getRow<DraftRow>(
    db,
    sql`SELECT * FROM drafts WHERE id = ${id} AND user_id = ${userId}`
  );
  return row ? mapDraft(db, row) : null;
}
export async function saveDraft(
  db: D1Database,
  userId: string,
  input: {
    id?: string | undefined;
    mailboxId: string | null;
    replyToMessageId: string | null;
    forwardOfMessageId: string | null;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    text: string;
    html: string;
    version?: number | undefined;
  }
): Promise<Draft> {
  const id = input.id ?? newId("drf");
  const current = input.id ? await getDraft(db, userId, input.id) : null;
  if (input.id && !current) throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  if (current && input.version !== current.version)
    throw new AppError("DRAFT_CONFLICT", "This draft changed in another session.", 409);
  const now = nowIso();
  const nextVersion = current ? current.version + 1 : 1;
  await createDatabase(db)
    .insert(drafts)
    .values({
      id,
      userId,
      mailboxId: input.mailboxId,
      replyToMessageId: input.replyToMessageId,
      forwardOfMessageId: input.forwardOfMessageId,
      fromAddress: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html,
      version: nextVersion,
      createdAt: current?.updatedAt ?? now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: drafts.id,
      set: {
        mailboxId: input.mailboxId,
        replyToMessageId: input.replyToMessageId,
        forwardOfMessageId: input.forwardOfMessageId,
        fromAddress: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        textBody: input.text,
        htmlBody: input.html,
        version: nextVersion,
        updatedAt: now
      }
    })
    .run();
  const saved = await getDraft(db, userId, id);
  if (!saved) throw new AppError("DRAFT_SAVE_FAILED", "Draft could not be saved.", 500);
  return saved;
}
export async function deleteDraft(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  id: string
): Promise<boolean> {
  const rows = await getRows<{ r2_key: string }>(
    db,
    sql`SELECT a.r2_key
        FROM draft_attachments a
        JOIN drafts d ON d.id = a.draft_id
        WHERE d.id = ${id} AND d.user_id = ${userId}`
  );
  const result = await createDatabase(db)
    .delete(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .run();
  await Promise.all(rows.map((row) => bucket.delete(row.r2_key)));
  return (result.meta.changes ?? 0) > 0;
}
export async function addDraftAttachment(
  db: D1Database,
  userId: string,
  draftId: string,
  file: File
): Promise<{ attachment: DraftAttachment; r2Key: string }> {
  if (!(await getDraft(db, userId, draftId)))
    throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  const total = await getRow<{ size: number }>(
    db,
    sql`SELECT COALESCE(SUM(size_bytes), 0) AS size
        FROM draft_attachments
        WHERE draft_id = ${draftId}`
  );
  if (file.size > 25 * 1024 * 1024 || (total?.size ?? 0) + file.size > 25 * 1024 * 1024)
    throw new AppError("ATTACHMENTS_TOO_LARGE", "Attachments may total at most 25 MiB.", 413);
  const id = newId("att");
  const r2Key = `drafts/${userId}/${draftId}/${id}`;
  const now = nowIso();
  await createDatabase(db)
    .insert(draftAttachments)
    .values({
      id,
      draftId,
      filename: file.name.slice(0, 255),
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      r2Key,
      createdAt: now
    })
    .run();
  return {
    attachment: {
      id,
      filename: file.name.slice(0, 255),
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size
    },
    r2Key
  };
}
export async function removeDraftAttachment(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  draftId: string,
  id: string
) {
  const row = await getRow<{ r2_key: string }>(
    db,
    sql`SELECT a.r2_key
        FROM draft_attachments a
        JOIN drafts d ON d.id = a.draft_id
        WHERE a.id = ${id} AND d.id = ${draftId} AND d.user_id = ${userId}`
  );
  if (!row) return false;
  await createDatabase(db).delete(draftAttachments).where(eq(draftAttachments.id, id)).run();
  await bucket.delete(row.r2_key);
  return true;
}
export async function draftAttachmentObjects(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  ids: string[]
): Promise<
  Array<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    r2Key: string;
    content: ArrayBuffer;
  }>
> {
  if (ids.length === 0) return [];
  const rows = await getRows<AttachmentRow>(
    db,
    sql`SELECT a.id, a.filename, a.content_type, a.size_bytes, a.r2_key
        FROM draft_attachments a
        JOIN drafts d ON d.id = a.draft_id
        WHERE d.user_id = ${userId} AND a.id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `
        )})`
  );
  if (rows.length !== new Set(ids).size)
    throw new AppError("ATTACHMENT_NOT_FOUND", "One or more attachments are unavailable.", 404);
  return Promise.all(
    rows.map(async (row) => {
      const object = await bucket.get(row.r2_key);
      if (!object)
        throw new AppError("ATTACHMENT_NOT_FOUND", "An attachment object is unavailable.", 404);
      return {
        id: row.id,
        filename: row.filename,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        r2Key: row.r2_key,
        content: await object.arrayBuffer()
      };
    })
  );
}

export async function draftIdsForAttachmentIds(
  db: D1Database,
  userId: string,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await getRows<{ id: string; draft_id: string }>(
    db,
    sql`SELECT a.id, a.draft_id FROM draft_attachments a
       JOIN drafts d ON d.id = a.draft_id
       WHERE d.user_id = ${userId} AND a.id IN (${sql.join(
         ids.map((id) => sql`${id}`),
         sql`, `
       )})`
  );
  if (rows.length !== new Set(ids).size) {
    throw new AppError("ATTACHMENT_NOT_FOUND", "One or more attachments are unavailable.", 404);
  }
  return [...new Set(rows.map((row) => row.draft_id))];
}
