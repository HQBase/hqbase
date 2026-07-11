import { newId, nowIso } from "../../db/client";
import { parseRawEmail } from "../../email/parse-email";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { ensureThread, insertMessage } from "../messages/queries";
import { recordMessageChange } from "./change-log";
import { decodeBase64 } from "./codec";

export type BridgeMutation = {
  idempotencyKey: string;
  operation: string;
  mailbox?: string | undefined;
  target?: string | undefined;
  destination?: string | undefined;
  flags?: string[] | undefined;
  raw?: string | undefined;
};

export function parseUIDs(target: string): number[] {
  const values = new Set<number>();
  for (const segment of target.split(",")) {
    const [startText, endText] = segment.split(":");
    const start = Number(startText);
    const end = Number(endText ?? startText);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end - start > 10_000
    ) {
      throw new AppError("INVALID_UID_SET", "Mutation target is not a supported UID set.", 400);
    }
    for (let value = start; value <= end; value += 1) values.add(value);
  }
  return [...values];
}

export async function applyMutation(env: WorkerEnv, userId: string, input: BridgeMutation) {
  const duplicate = await env.DB.prepare(
    "SELECT 1 FROM pro_bridge_mutations WHERE idempotency_key = ? AND user_id = ?"
  )
    .bind(input.idempotencyKey, userId)
    .first();
  if (duplicate) return;
  if (!input.mailbox || (input.operation !== "append" && !input.target)) {
    throw new AppError("MUTATION_UNSUPPORTED", "This IMAP mutation is not supported yet.", 422);
  }
  const mailbox = await env.DB.prepare(
    "SELECT id FROM pro_imap_mailboxes WHERE user_id = ? AND name = ?"
  )
    .bind(userId, input.mailbox)
    .first<{ id: string }>();
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "IMAP mailbox not found.", 404);
  const timestamp = nowIso();
  if (input.operation === "expunge") {
    await expungeMessages(env, mailbox.id, parseUIDs(input.target ?? ""));
  } else if (input.operation === "store-flags") {
    await storeFlags(
      env,
      userId,
      mailbox.id,
      parseUIDs(input.target ?? ""),
      input.flags ?? [],
      timestamp
    );
  } else if (input.operation === "append" && input.raw) {
    await appendMessage(env, mailbox.id, input.raw, input.flags ?? [], timestamp);
  } else if (input.operation === "copy" && input.target && input.destination) {
    await copyMessages(
      env,
      userId,
      mailbox.id,
      input.destination,
      parseUIDs(input.target),
      timestamp
    );
  } else {
    throw new AppError("MUTATION_UNSUPPORTED", "This IMAP mutation is not supported.", 422);
  }
  await env.DB.prepare(
    "INSERT INTO pro_bridge_mutations (idempotency_key, user_id, created_at) VALUES (?, ?, ?)"
  )
    .bind(input.idempotencyKey, userId, timestamp)
    .run();
}

async function copyMessages(
  env: WorkerEnv,
  userId: string,
  sourceMailboxId: string,
  destinationName: string,
  uids: number[],
  timestamp: string
) {
  const destination = await env.DB.prepare(
    "SELECT source_folder FROM pro_imap_mailboxes WHERE user_id = ? AND name = ?"
  )
    .bind(userId, destinationName)
    .first<{ source_folder: string | null }>();
  if (!destination?.source_folder) {
    throw new AppError("COPY_UNSUPPORTED", "Messages cannot be copied to this mailbox.", 422);
  }
  for (const uid of uids) {
    const source = await env.DB.prepare(
      "SELECT message_id FROM pro_imap_messages WHERE mailbox_id = ? AND uid = ?"
    )
      .bind(sourceMailboxId, uid)
      .first<{ message_id: string }>();
    if (!source) continue;
    const cloneId = newId("msg");
    await env.DB.prepare(
      `INSERT INTO messages
       SELECT ?, thread_id, mailbox_id, direction, ?, from_address, to_json, cc_json, bcc_json,
              subject, snippet, text_body, html_r2_key, raw_r2_key, message_id, NULL, in_reply_to,
              references_json, received_at, sent_at, read_at, starred_at, archived_at, trashed_at,
              has_attachments, ?, ?
       FROM messages WHERE id = ?`
    )
      .bind(cloneId, destination.source_folder, timestamp, timestamp, source.message_id)
      .run();
    const attachments = await env.DB.prepare(
      "SELECT filename, content_type, size_bytes, content_id, r2_key FROM message_attachments WHERE message_id = ?"
    )
      .bind(source.message_id)
      .all<{
        filename: string;
        content_type: string;
        size_bytes: number;
        content_id: string | null;
        r2_key: string;
      }>();
    for (const attachment of attachments.results) {
      await env.DB.prepare(
        `INSERT INTO message_attachments
         (id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          newId("att"),
          cloneId,
          attachment.filename,
          attachment.content_type,
          attachment.size_bytes,
          attachment.content_id,
          attachment.r2_key,
          timestamp
        )
        .run();
    }
    await recordMessageChange(env.DB, cloneId);
  }
}

async function appendMessage(
  env: WorkerEnv,
  mailboxId: string,
  encodedRaw: string,
  flags: string[],
  timestamp: string
) {
  const mailbox = await env.DB.prepare("SELECT source_folder FROM pro_imap_mailboxes WHERE id = ?")
    .bind(mailboxId)
    .first<{ source_folder: string | null }>();
  if (!mailbox?.source_folder) {
    throw new AppError("APPEND_UNSUPPORTED", "Messages cannot be appended to this mailbox.", 422);
  }
  const raw = decodeBase64(encodedRaw);
  if (raw.byteLength > 25 * 1024 * 1024) {
    throw new AppError("MESSAGE_TOO_LARGE", "Message exceeds the 25 MiB limit.", 413);
  }
  const parsed = await parseRawEmail(raw);
  const rawKey = `imap/${timestamp.slice(0, 10)}/${newId("raw")}.eml`;
  await env.MAIL_OBJECTS.put(rawKey, raw, { httpMetadata: { contentType: "message/rfc822" } });
  const threadId = await ensureThread(env.DB, parsed.subject, timestamp);
  const folder = mailbox.source_folder as
    | "inbox"
    | "sent"
    | "drafts"
    | "archived"
    | "trash"
    | "catchall";
  const outbound = folder === "sent" || folder === "drafts";
  await insertMessage(env.DB, {
    threadId,
    mailboxId: null,
    direction: outbound ? "outbound" : "inbound",
    folder,
    fromAddress: parsed.fromAddress,
    to: parsed.to,
    cc: parsed.cc,
    bcc: parsed.bcc,
    subject: parsed.subject,
    snippet: parsed.snippet,
    textBody: parsed.textBody,
    htmlR2Key: null,
    rawR2Key: rawKey,
    messageId: parsed.messageId,
    dedupeKey: null,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    receivedAt: outbound ? null : timestamp,
    sentAt: folder === "sent" ? timestamp : null,
    readAt: flags.includes("\\Seen") ? timestamp : null,
    hasAttachments: parsed.attachments.length > 0
  });
}

async function storeFlags(
  env: WorkerEnv,
  userId: string,
  mailboxId: string,
  uids: number[],
  flags: string[],
  timestamp: string
) {
  let ordinal = 0;
  for (const uid of uids) {
    const mapping = await env.DB.prepare(
      "SELECT message_id FROM pro_imap_messages WHERE mailbox_id = ? AND uid = ?"
    )
      .bind(mailboxId, uid)
      .first<{ message_id: string }>();
    if (!mapping) continue;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE pro_imap_messages SET flags_json = ?, updated_at = ? WHERE mailbox_id = ? AND uid = ?"
      ).bind(JSON.stringify(flags), timestamp, mailboxId, uid),
      env.DB.prepare(
        "UPDATE messages SET read_at = ?, starred_at = ?, updated_at = ? WHERE id = ?"
      ).bind(
        flags.includes("\\Seen") ? timestamp : null,
        flags.includes("\\Flagged") ? timestamp : null,
        timestamp,
        mapping.message_id
      )
    ]);
    const sourceSeq = await recordMessageChange(env.DB, mapping.message_id);
    await env.DB.prepare(
      `INSERT INTO pro_imap_events
       (user_id, source_seq, ordinal, kind, mailbox_id, uid, flags_json)
       VALUES (?, ?, ?, 'flags', ?, ?, ?)`
    )
      .bind(userId, sourceSeq, ordinal++, mailboxId, uid, JSON.stringify(flags))
      .run();
  }
}

async function expungeMessages(env: WorkerEnv, mailboxId: string, uids: number[]) {
  for (const uid of uids) {
    const mapping = await env.DB.prepare(
      `SELECT im.message_id, im.flags_json, m.raw_r2_key
       FROM pro_imap_messages im JOIN messages m ON m.id = im.message_id
       WHERE im.mailbox_id = ? AND im.uid = ?`
    )
      .bind(mailboxId, uid)
      .first<{ message_id: string; flags_json: string; raw_r2_key: string | null }>();
    if (!mapping) continue;
    const flags = JSON.parse(mapping.flags_json) as string[];
    if (!flags.includes("\\Deleted")) {
      throw new AppError("EXPUNGE_REQUIRES_DELETED", "Only deleted messages can be expunged.", 409);
    }
    const sourceSeq = await recordMessageChange(env.DB, mapping.message_id);
    const affected = await env.DB.prepare(
      `SELECT mb.user_id, im.mailbox_id, im.uid
       FROM pro_imap_messages im JOIN pro_imap_mailboxes mb ON mb.id = im.mailbox_id
       WHERE im.message_id = ? ORDER BY mb.user_id, im.uid`
    )
      .bind(mapping.message_id)
      .all<{ user_id: string; mailbox_id: string; uid: number }>();
    const ordinalByUser = new Map<string, number>();
    for (const item of affected.results) {
      const ordinal = ordinalByUser.get(item.user_id) ?? 0;
      await env.DB.prepare(
        `INSERT INTO pro_imap_events
         (user_id, source_seq, ordinal, kind, mailbox_id, uid)
         VALUES (?, ?, ?, 'expunge', ?, ?)`
      )
        .bind(item.user_id, sourceSeq, ordinal, item.mailbox_id, item.uid)
        .run();
      ordinalByUser.set(item.user_id, ordinal + 1);
    }
    const attachments = await env.DB.prepare(
      "SELECT r2_key FROM message_attachments WHERE message_id = ?"
    )
      .bind(mapping.message_id)
      .all<{ r2_key: string }>();
    await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(mapping.message_id).run();
    if (mapping.raw_r2_key) {
      const reference = await env.DB.prepare("SELECT 1 FROM messages WHERE raw_r2_key = ? LIMIT 1")
        .bind(mapping.raw_r2_key)
        .first();
      if (!reference) await env.MAIL_OBJECTS.delete(mapping.raw_r2_key);
    }
    if (attachments.results.length) {
      await env.MAIL_OBJECTS.delete(attachments.results.map((attachment) => attachment.r2_key));
    }
  }
}
