import { newId, nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { decodeCursor, encodeCursor } from "./cursor";
import {
  fallbackRaw,
  flagsFor,
  type MailboxRow,
  type MessageRow,
  mailboxDefinitions
} from "./sync-format";

export async function ensureMailboxesV2(
  db: D1Database,
  userId: string,
  role: WorkspaceRole
): Promise<MailboxRow[]> {
  const timestamp = nowIso();
  for (const definition of mailboxDefinitions) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO pro_imap_mailboxes
         (id, user_id, name, special_use, source_folder, uid_validity, uid_next, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .bind(
        newId("imb"),
        userId,
        definition.name,
        definition.specialUse ?? null,
        definition.sourceFolder ?? null,
        Math.max(1, Math.floor(Date.now() / 1000)),
        timestamp,
        timestamp
      )
      .run();
    await db
      .prepare(
        `UPDATE pro_imap_mailboxes SET special_use = ?, source_folder = ?, updated_at = ?
         WHERE user_id = ? AND name = ?`
      )
      .bind(
        definition.specialUse ?? null,
        definition.sourceFolder ?? null,
        timestamp,
        userId,
        definition.name
      )
      .run();
  }
  if (role !== "owner") {
    await db
      .prepare(
        `DELETE FROM pro_imap_messages
         WHERE mailbox_id IN (SELECT id FROM pro_imap_mailboxes WHERE user_id = ?)
         AND message_id IN (
           SELECT id FROM messages
           WHERE mailbox_id IS NULL OR mailbox_id NOT IN (
             SELECT mailbox_id FROM pro_mailbox_grants WHERE user_id = ?
           )
         )`
      )
      .bind(userId, userId)
      .run();
  }
  const result = await db
    .prepare(
      `SELECT id, name, special_use, source_folder, uid_validity, uid_next,
              backfill_created_at, backfill_message_id, backfill_complete
       FROM pro_imap_mailboxes WHERE user_id = ? ORDER BY rowid`
    )
    .bind(userId)
    .all<MailboxRow>();
  return result.results;
}

async function rawSize(env: WorkerEnv, message: MessageRow): Promise<number> {
  if (!message.raw_r2_key) return fallbackRaw(message).byteLength;
  const object = await env.MAIL_OBJECTS.head(message.raw_r2_key);
  return object?.size ?? fallbackRaw(message).byteLength;
}

async function allocateUID(db: D1Database, mailboxId: string): Promise<number> {
  const row = await db
    .prepare(
      "UPDATE pro_imap_mailboxes SET uid_next = uid_next + 1, updated_at = ? WHERE id = ? RETURNING uid_next - 1 AS uid"
    )
    .bind(nowIso(), mailboxId)
    .first<{ uid: number }>();
  if (!row) throw new AppError("MAILBOX_NOT_FOUND", "IMAP mailbox not found.", 404);
  return row.uid;
}

async function backfillMailbox(
  env: WorkerEnv,
  userId: string,
  role: WorkspaceRole,
  mailbox: MailboxRow,
  limit: number
): Promise<void> {
  if (mailbox.backfill_complete || !mailbox.source_folder) {
    if (!mailbox.backfill_complete) {
      await env.DB.prepare("UPDATE pro_imap_mailboxes SET backfill_complete = 1 WHERE id = ?")
        .bind(mailbox.id)
        .run();
    }
    return;
  }
  const result = await env.DB.prepare(
    `SELECT id, folder, read_at, starred_at, created_at, received_at, sent_at, raw_r2_key,
            from_address, to_json, subject, text_body, message_id
     FROM messages
     WHERE folder = ?
       AND (? = 'owner' OR mailbox_id IN (
         SELECT mailbox_id FROM pro_mailbox_grants WHERE user_id = ?
       ))
       AND (created_at > ? OR (created_at = ? AND id > ?))
     ORDER BY created_at, id LIMIT ?`
  )
    .bind(
      mailbox.source_folder,
      role,
      userId,
      mailbox.backfill_created_at ?? "",
      mailbox.backfill_created_at ?? "",
      mailbox.backfill_message_id ?? "",
      limit
    )
    .all<MessageRow>();

  for (const message of result.results) {
    const existing = await env.DB.prepare(
      "SELECT 1 FROM pro_imap_messages WHERE mailbox_id = ? AND message_id = ?"
    )
      .bind(mailbox.id, message.id)
      .first();
    if (!existing) {
      const uid = await allocateUID(env.DB, mailbox.id);
      const timestamp = message.received_at ?? message.sent_at ?? message.created_at;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO pro_imap_messages
         (mailbox_id, message_id, uid, flags_json, internal_date, raw_size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          mailbox.id,
          message.id,
          uid,
          JSON.stringify(flagsFor(message)),
          timestamp,
          await rawSize(env, message),
          nowIso(),
          nowIso()
        )
        .run();
    }
  }

  const last = result.results.at(-1);
  await env.DB.prepare(
    `UPDATE pro_imap_mailboxes
     SET backfill_created_at = COALESCE(?, backfill_created_at),
         backfill_message_id = COALESCE(?, backfill_message_id),
         backfill_complete = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      last?.created_at ?? null,
      last?.id ?? null,
      result.results.length < limit ? 1 : 0,
      nowIso(),
      mailbox.id,
      userId
    )
    .run();
}

export async function listMailboxMessages(
  env: WorkerEnv,
  userId: string,
  role: WorkspaceRole,
  mailboxId: string,
  afterUid: number,
  limit: number
) {
  const mailbox = await env.DB.prepare(
    `SELECT id, name, special_use, source_folder, uid_validity, uid_next,
            backfill_created_at, backfill_message_id, backfill_complete
     FROM pro_imap_mailboxes WHERE id = ? AND user_id = ?`
  )
    .bind(mailboxId, userId)
    .first<MailboxRow>();
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "IMAP mailbox not found.", 404);
  await backfillMailbox(env, userId, role, mailbox, limit);
  const refreshed = await env.DB.prepare(
    "SELECT backfill_complete FROM pro_imap_mailboxes WHERE id = ?"
  )
    .bind(mailboxId)
    .first<{ backfill_complete: number }>();
  const result = await env.DB.prepare(
    `SELECT uid, flags_json, internal_date, raw_size
     FROM pro_imap_messages WHERE mailbox_id = ? AND uid > ? ORDER BY uid LIMIT ?`
  )
    .bind(mailboxId, afterUid, limit + 1)
    .all<{ uid: number; flags_json: string; internal_date: string; raw_size: number }>();
  const page = result.results.slice(0, limit);
  const hasMore = result.results.length > limit || refreshed?.backfill_complete !== 1;
  return {
    messages: page.map((message) => ({
      uid: message.uid,
      flags: JSON.parse(message.flags_json) as string[],
      internalDate: message.internal_date,
      size: message.raw_size
    })),
    nextAfterUid: page.at(-1)?.uid ?? afterUid,
    hasMore
  };
}

async function reconcileChange(
  env: WorkerEnv,
  userId: string,
  role: WorkspaceRole,
  sourceSeq: number,
  messageId: string
): Promise<void> {
  const alreadyMaterialized = await env.DB.prepare(
    "SELECT 1 FROM pro_imap_events WHERE user_id = ? AND source_seq = ? LIMIT 1"
  )
    .bind(userId, sourceSeq)
    .first();
  if (alreadyMaterialized) return;
  const message = await env.DB.prepare(
    `SELECT id, folder, read_at, starred_at, created_at, received_at, sent_at, raw_r2_key,
            from_address, to_json, subject, text_body, message_id
     FROM messages WHERE id = ?
       AND (? = 'owner' OR mailbox_id IN (
         SELECT mailbox_id FROM pro_mailbox_grants WHERE user_id = ?
       ))`
  )
    .bind(messageId, role, userId)
    .first<MessageRow>();
  const mailboxes = await ensureMailboxesV2(env.DB, userId, role);
  const desired = message
    ? mailboxes.find((mailbox) => mailbox.source_folder === message.folder)
    : null;
  const existing = await env.DB.prepare(
    `SELECT im.mailbox_id, im.uid, im.flags_json FROM pro_imap_messages im
     JOIN pro_imap_mailboxes mb ON mb.id = im.mailbox_id
     WHERE mb.user_id = ? AND im.message_id = ?`
  )
    .bind(userId, messageId)
    .all<{ mailbox_id: string; uid: number; flags_json: string }>();
  let ordinal = 0;
  for (const mapping of existing.results) {
    if (!desired || mapping.mailbox_id !== desired.id) {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO pro_imap_events
           (user_id, source_seq, ordinal, kind, mailbox_id, uid)
           VALUES (?, ?, ?, 'expunge', ?, ?)`
        ).bind(userId, sourceSeq, ordinal++, mapping.mailbox_id, mapping.uid),
        env.DB.prepare("DELETE FROM pro_imap_messages WHERE mailbox_id = ? AND uid = ?").bind(
          mapping.mailbox_id,
          mapping.uid
        )
      ]);
    }
  }
  if (!message || !desired) return;
  const kept = existing.results.find((mapping) => mapping.mailbox_id === desired.id);
  const flags = flagsFor(message);
  if (kept) {
    if (kept.flags_json !== JSON.stringify(flags)) {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE pro_imap_messages SET flags_json = ?, updated_at = ? WHERE mailbox_id = ? AND uid = ?"
        ).bind(JSON.stringify(flags), nowIso(), desired.id, kept.uid),
        env.DB.prepare(
          `INSERT OR IGNORE INTO pro_imap_events
           (user_id, source_seq, ordinal, kind, mailbox_id, uid, flags_json)
           VALUES (?, ?, ?, 'flags', ?, ?, ?)`
        ).bind(userId, sourceSeq, ordinal, desired.id, kept.uid, JSON.stringify(flags))
      ]);
    }
    return;
  }
  const uid = await allocateUID(env.DB, desired.id);
  const internalDate = message.received_at ?? message.sent_at ?? message.created_at;
  const size = await rawSize(env, message);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pro_imap_messages
       (mailbox_id, message_id, uid, flags_json, internal_date, raw_size, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      desired.id,
      message.id,
      uid,
      JSON.stringify(flags),
      internalDate,
      size,
      nowIso(),
      nowIso()
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO pro_imap_events
       (user_id, source_seq, ordinal, kind, mailbox_id, uid, flags_json, internal_date, size_bytes)
       VALUES (?, ?, ?, 'upsert', ?, ?, ?, ?, ?)`
    ).bind(userId, sourceSeq, ordinal, desired.id, uid, JSON.stringify(flags), internalDate, size)
  ]);
}

export async function listChanges(
  env: WorkerEnv,
  userId: string,
  role: WorkspaceRole,
  cursor: string,
  limit: number
) {
  const after = await decodeCursor(cursor, env.PRO_SESSION_SECRET);
  const minimum = await env.DB.prepare(
    "SELECT COALESCE(MIN(seq), 0) AS seq FROM pro_message_changes"
  ).first<{ seq: number }>();
  if ((minimum?.seq ?? 0) > 0 && after < (minimum?.seq ?? 0) - 1) {
    throw new AppError(
      "CURSOR_EXPIRED",
      "Synchronization history expired. Perform a full mailbox resynchronization.",
      409
    );
  }
  const maximum = await env.DB.prepare(
    "SELECT COALESCE(MAX(seq), 0) AS seq FROM pro_message_changes"
  ).first<{
    seq: number;
  }>();
  if (after > (maximum?.seq ?? 0)) {
    throw new AppError("CURSOR_INVALID", "Synchronization cursor is ahead of the server.", 400);
  }
  const changes = await env.DB.prepare(
    "SELECT seq, message_id FROM pro_message_changes WHERE seq > ? ORDER BY seq LIMIT ?"
  )
    .bind(after, limit)
    .all<{ seq: number; message_id: string | null }>();
  for (const change of changes.results) {
    if (change.message_id) {
      await reconcileChange(env, userId, role, change.seq, change.message_id);
    }
  }
  const lastSeq = changes.results.at(-1)?.seq ?? after;
  await env.DB.prepare(
    `UPDATE pro_mail_sessions SET last_change_seq = ?
     WHERE user_id = ? AND revoked_at IS NULL AND last_change_seq < ?`
  )
    .bind(lastSeq, userId, lastSeq)
    .run();
  const events = await env.DB.prepare(
    `SELECT source_seq, kind, mailbox_id, uid, flags_json, internal_date, size_bytes
     FROM pro_imap_events WHERE user_id = ? AND source_seq > ? AND source_seq <= ?
     ORDER BY source_seq, ordinal`
  )
    .bind(userId, after, lastSeq)
    .all<{
      source_seq: number;
      kind: string;
      mailbox_id: string;
      uid: number;
      flags_json: string | null;
      internal_date: string | null;
      size_bytes: number | null;
    }>();
  return {
    events: events.results.map((event) => ({
      cursor: event.source_seq,
      kind: event.kind,
      mailboxId: event.mailbox_id,
      uid: event.uid,
      ...(event.flags_json ? { flags: JSON.parse(event.flags_json) as string[] } : {}),
      ...(event.internal_date ? { internalDate: event.internal_date } : {}),
      ...(event.size_bytes !== null ? { size: event.size_bytes } : {})
    })),
    cursor: await encodeCursor(lastSeq, env.PRO_SESSION_SECRET),
    hasMore: lastSeq < (maximum?.seq ?? 0)
  };
}
