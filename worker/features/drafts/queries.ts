import { and, eq, sql } from "drizzle-orm";

import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { draftAttachments, drafts } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { labelsForDraftIds } from "../labels/queries";
import { emptySignatureSnapshot } from "../signatures/service";
import type { SignatureSelection, SignatureSnapshot } from "../signatures/types";
import type { Draft, DraftAttachment } from "./types";

export type DraftRow = {
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
  signature_mode: SignatureSnapshot["mode"];
  signature_id: string | null;
  signature_name_snapshot: string;
  signature_html_snapshot: string;
  signature_text_snapshot: string;
  version: number;
  updated_at: string;
};
export type AttachmentRow = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  content_id: string | null;
  r2_key: string;
};
export type PageAttachmentRow = AttachmentRow & { draft_id: string };
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
export const mapAttachment = (row: AttachmentRow): DraftAttachment => ({
  id: row.id,
  filename: row.filename,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  inline: row.content_id !== null
});

async function attachments(db: D1Database, draftId: string) {
  return getRows<AttachmentRow>(
    db,
    sql`SELECT id, filename, content_type, size_bytes, content_id, r2_key
        FROM draft_attachments
        WHERE draft_id = ${draftId}
        ORDER BY created_at`
  );
}
async function mapDraft(db: D1Database, row: DraftRow): Promise<Draft> {
  const [draftAttachments, assigned] = await Promise.all([
    attachments(db, row.id),
    labelsForDraftIds(db, [row.id])
  ]);
  return mapDraftRow(row, draftAttachments.map(mapAttachment), assigned.get(row.id) ?? []);
}
export function mapDraftRow(
  row: DraftRow,
  draftAttachments: DraftAttachment[],
  labels: Draft["labels"]
): Draft {
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
    signature: {
      mode: row.signature_mode,
      id: row.signature_id,
      name: row.signature_name_snapshot,
      html: row.signature_html_snapshot,
      text: row.signature_text_snapshot
    },
    version: row.version,
    updatedAt: row.updated_at,
    attachments: draftAttachments,
    labels
  };
}
export async function getDraft(
  db: D1Database,
  principalId: string,
  id: string
): Promise<Draft | null> {
  const row = await getRow<DraftRow>(
    db,
    sql`SELECT * FROM drafts WHERE id = ${id} AND principal_id = ${principalId}`
  );
  return row ? mapDraft(db, row) : null;
}

export async function attachmentsForDrafts(
  db: D1Database,
  draftIds: string[]
): Promise<PageAttachmentRow[]> {
  if (draftIds.length === 0) return [];
  return getRows<PageAttachmentRow>(
    db,
    sql`SELECT draft_id, id, filename, content_type, size_bytes, content_id, r2_key
        FROM draft_attachments
        WHERE draft_id IN (${sql.join(
          draftIds.map((id) => sql`${id}`),
          sql`, `
        )})
        ORDER BY draft_id, created_at`
  );
}
export async function saveDraft(
  db: D1Database,
  principalId: string,
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
    signature?: SignatureSelection | SignatureSnapshot | undefined;
    version?: number | undefined;
  }
): Promise<Draft> {
  const id = input.id ?? newId("drf");
  const current = input.id ? await getDraft(db, principalId, input.id) : null;
  if (input.id && !current) throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  if (current && input.version !== current.version)
    throw new AppError("DRAFT_CONFLICT", "This draft changed in another session.", 409);
  const now = nowIso();
  const nextVersion = current ? current.version + 1 : 1;
  const signature =
    input.signature && "name" in input.signature
      ? input.signature
      : (current?.signature ?? emptySignatureSnapshot("none"));
  await createDatabase(db)
    .insert(drafts)
    .values({
      id,
      principalId,
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
      signatureMode: signature.mode,
      signatureId: signature.id,
      signatureNameSnapshot: signature.name,
      signatureHtmlSnapshot: signature.html,
      signatureTextSnapshot: signature.text,
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
        signatureMode: signature.mode,
        signatureId: signature.id,
        signatureNameSnapshot: signature.name,
        signatureHtmlSnapshot: signature.html,
        signatureTextSnapshot: signature.text,
        version: nextVersion,
        updatedAt: now
      }
    })
    .run();
  const saved = await getDraft(db, principalId, id);
  if (!saved) throw new AppError("DRAFT_SAVE_FAILED", "Draft could not be saved.", 500);
  return saved;
}
export async function deleteDraft(
  db: D1Database,
  bucket: R2Bucket,
  principalId: string,
  id: string
): Promise<boolean> {
  const rows = await getRows<{ r2_key: string }>(
    db,
    sql`SELECT a.r2_key
        FROM draft_attachments a
        JOIN drafts d ON d.id = a.draft_id
        WHERE d.id = ${id} AND d.principal_id = ${principalId}`
  );
  const result = await createDatabase(db)
    .delete(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.principalId, principalId)))
    .run();
  for (let start = 0; start < rows.length; start += 1_000) {
    await bucket.delete(rows.slice(start, start + 1_000).map((row) => row.r2_key));
  }
  return (result.meta.changes ?? 0) > 0;
}
export async function addDraftAttachment(
  db: D1Database,
  principalId: string,
  draftId: string,
  file: File,
  inline = false
): Promise<{ attachment: DraftAttachment; r2Key: string }> {
  if (!(await getDraft(db, principalId, draftId)))
    throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  const id = newId("att");
  const r2Key = `drafts/${principalId}/${draftId}/${id}`;
  const now = nowIso();
  const filename = file.name.slice(0, 255);
  const contentType = file.type || "application/octet-stream";
  const maxBytes = 25 * 1024 * 1024;
  const result = await db
    .prepare(
      `INSERT INTO draft_attachments
       (id, draft_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
       SELECT ?, d.id, ?, ?, ?, ?, ?, ?
       FROM drafts d
       WHERE d.id = ?
         AND d.principal_id = ?
         AND ? <= ?
         AND COALESCE(
           (SELECT SUM(a.size_bytes) FROM draft_attachments a WHERE a.draft_id = d.id),
           0
         ) + ? <= ?`
    )
    .bind(
      id,
      filename,
      contentType,
      file.size,
      inline ? `${id}@hqbase.invalid` : null,
      r2Key,
      now,
      draftId,
      principalId,
      file.size,
      maxBytes,
      file.size,
      maxBytes
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    if (!(await getDraft(db, principalId, draftId))) {
      throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
    }
    throw new AppError("ATTACHMENTS_TOO_LARGE", "Attachments may total at most 25 MiB.", 413);
  }
  return {
    attachment: {
      id,
      filename,
      contentType,
      sizeBytes: file.size,
      inline
    },
    r2Key
  };
}
export async function deleteDraftAttachmentRecord(
  db: D1Database,
  draftId: string,
  id: string
): Promise<void> {
  await createDatabase(db)
    .delete(draftAttachments)
    .where(and(eq(draftAttachments.id, id), eq(draftAttachments.draftId, draftId)))
    .run();
}
export async function findInlineDraftAttachment(
  db: D1Database,
  principalId: string,
  draftId: string,
  id: string
): Promise<AttachmentRow | null> {
  return getRow<AttachmentRow>(
    db,
    sql`SELECT a.id, a.filename, a.content_type, a.size_bytes, a.content_id, a.r2_key
        FROM draft_attachments a
        JOIN drafts d ON d.id = a.draft_id
        WHERE a.id = ${id}
          AND a.draft_id = ${draftId}
          AND d.principal_id = ${principalId}
          AND a.content_id IS NOT NULL`
  );
}
export async function removeDraftAttachment(
  db: D1Database,
  bucket: R2Bucket,
  principalId: string,
  draftId: string,
  id: string
) {
  const row = await getRow<{ r2_key: string }>(
    db,
    sql`SELECT a.r2_key
        FROM draft_attachments a
        JOIN drafts d ON d.id = a.draft_id
        WHERE a.id = ${id} AND d.id = ${draftId} AND d.principal_id = ${principalId}`
  );
  if (!row) return false;
  await createDatabase(db).delete(draftAttachments).where(eq(draftAttachments.id, id)).run();
  await bucket.delete(row.r2_key);
  return true;
}
