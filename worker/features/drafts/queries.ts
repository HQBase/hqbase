import { newId, nowIso } from "../../db/client";
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
  const rows = await db
    .prepare(
      "SELECT id, filename, content_type, size_bytes, r2_key FROM draft_attachments WHERE draft_id = ? ORDER BY created_at"
    )
    .bind(draftId)
    .all<AttachmentRow>();
  return rows.results;
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
  const rows = await db
    .prepare("SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(userId)
    .all<DraftRow>();
  return Promise.all(rows.results.map((row) => mapDraft(db, row)));
}
export async function getDraft(db: D1Database, userId: string, id: string): Promise<Draft | null> {
  const row = await db
    .prepare("SELECT * FROM drafts WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<DraftRow>();
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
  await db
    .prepare(
      `INSERT INTO drafts (id, user_id, mailbox_id, reply_to_message_id, forward_of_message_id, from_address, to_json, cc_json, bcc_json, subject, text_body, html_body, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET mailbox_id=excluded.mailbox_id, reply_to_message_id=excluded.reply_to_message_id, forward_of_message_id=excluded.forward_of_message_id, from_address=excluded.from_address, to_json=excluded.to_json, cc_json=excluded.cc_json, bcc_json=excluded.bcc_json, subject=excluded.subject, text_body=excluded.text_body, html_body=excluded.html_body, version=excluded.version, updated_at=excluded.updated_at`
    )
    .bind(
      id,
      userId,
      input.mailboxId,
      input.replyToMessageId,
      input.forwardOfMessageId,
      input.from,
      JSON.stringify(input.to),
      JSON.stringify(input.cc),
      JSON.stringify(input.bcc),
      input.subject,
      input.text,
      input.html,
      nextVersion,
      current?.updatedAt ?? now,
      now
    )
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
  const rows = await db
    .prepare(
      "SELECT a.r2_key FROM draft_attachments a JOIN drafts d ON d.id=a.draft_id WHERE d.id=? AND d.user_id=?"
    )
    .bind(id, userId)
    .all<{ r2_key: string }>();
  const result = await db
    .prepare("DELETE FROM drafts WHERE id=? AND user_id=?")
    .bind(id, userId)
    .run();
  await Promise.all(rows.results.map((row) => bucket.delete(row.r2_key)));
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
  const total = await db
    .prepare("SELECT COALESCE(SUM(size_bytes),0) AS size FROM draft_attachments WHERE draft_id=?")
    .bind(draftId)
    .first<{ size: number }>();
  if (file.size > 25 * 1024 * 1024 || (total?.size ?? 0) + file.size > 25 * 1024 * 1024)
    throw new AppError("ATTACHMENTS_TOO_LARGE", "Attachments may total at most 25 MiB.", 413);
  const id = newId("att");
  const r2Key = `drafts/${userId}/${draftId}/${id}`;
  const now = nowIso();
  await db
    .prepare(
      "INSERT INTO draft_attachments (id,draft_id,filename,content_type,size_bytes,r2_key,created_at) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(
      id,
      draftId,
      file.name.slice(0, 255),
      file.type || "application/octet-stream",
      file.size,
      r2Key,
      now
    )
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
  const row = await db
    .prepare(
      "SELECT a.r2_key FROM draft_attachments a JOIN drafts d ON d.id=a.draft_id WHERE a.id=? AND d.id=? AND d.user_id=?"
    )
    .bind(id, draftId, userId)
    .first<{ r2_key: string }>();
  if (!row) return false;
  await db.prepare("DELETE FROM draft_attachments WHERE id=?").bind(id).run();
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
  const rows = await db
    .prepare(
      `SELECT a.id,a.filename,a.content_type,a.size_bytes,a.r2_key FROM draft_attachments a JOIN drafts d ON d.id=a.draft_id WHERE d.user_id=? AND a.id IN (${ids.map(() => "?").join(",")})`
    )
    .bind(userId, ...ids)
    .all<AttachmentRow>();
  if (rows.results.length !== new Set(ids).size)
    throw new AppError("ATTACHMENT_NOT_FOUND", "One or more attachments are unavailable.", 404);
  return Promise.all(
    rows.results.map(async (row) => {
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
  const rows = await db
    .prepare(
      `SELECT a.id, a.draft_id FROM draft_attachments a
       JOIN drafts d ON d.id = a.draft_id
       WHERE d.user_id = ? AND a.id IN (${ids.map(() => "?").join(",")})`
    )
    .bind(userId, ...ids)
    .all<{ id: string; draft_id: string }>();
  if (rows.results.length !== new Set(ids).size) {
    throw new AppError("ATTACHMENT_NOT_FOUND", "One or more attachments are unavailable.", 404);
  }
  return [...new Set(rows.results.map((row) => row.draft_id))];
}
