import { newId, nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { encodeBase64 } from "./codec";

type SourceFolder = "inbox" | "sent" | "archived" | "trash" | "catchall";
type MailboxDefinition = { name: string; specialUse?: string; sourceFolder?: SourceFolder };
const definitions: MailboxDefinition[] = [
  { name: "INBOX", sourceFolder: "inbox" },
  { name: "Sent", specialUse: "sent", sourceFolder: "sent" },
  { name: "Drafts", specialUse: "drafts" },
  { name: "Archive", specialUse: "archive", sourceFolder: "archived" },
  { name: "Trash", specialUse: "trash", sourceFolder: "trash" },
  { name: "Catch-all", sourceFolder: "catchall" }
];

type ImapMailboxRow = {
  id: string;
  name: string;
  special_use: string | null;
  source_folder: SourceFolder | null;
};
type SnapshotMessageRow = {
  id: string;
  uid: number;
  flags_json: string;
  internal_date: string;
  raw_r2_key: string | null;
  from_address: string;
  to_json: string;
  subject: string;
  text_body: string;
  message_id: string | null;
};

async function ensureMailboxes(db: D1Database, userId: string): Promise<ImapMailboxRow[]> {
  const timestamp = nowIso();
  for (const definition of definitions) {
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
        Math.floor(Date.now() / 1000),
        timestamp,
        timestamp
      )
      .run();
  }
  const result = await db
    .prepare(
      "SELECT id, name, special_use, source_folder FROM pro_imap_mailboxes WHERE user_id = ? ORDER BY rowid"
    )
    .bind(userId)
    .all<ImapMailboxRow>();
  return result.results;
}

async function synchronizeUIDs(db: D1Database, mailbox: ImapMailboxRow): Promise<void> {
  if (!mailbox.source_folder) return;
  const messages = await db
    .prepare(
      "SELECT id, read_at, starred_at FROM messages WHERE folder = ? ORDER BY created_at, id"
    )
    .bind(mailbox.source_folder)
    .all<{ id: string; read_at: string | null; starred_at: string | null }>();
  for (const message of messages.results) {
    const existing = await db
      .prepare("SELECT 1 FROM pro_imap_messages WHERE mailbox_id = ? AND message_id = ?")
      .bind(mailbox.id, message.id)
      .first();
    if (existing) continue;
    const uidRow = await db
      .prepare("SELECT uid_next FROM pro_imap_mailboxes WHERE id = ?")
      .bind(mailbox.id)
      .first<{ uid_next: number }>();
    const uid = uidRow?.uid_next ?? 1;
    const flags = [
      message.read_at ? "\\Seen" : null,
      message.starred_at ? "\\Flagged" : null
    ].filter(Boolean);
    const timestamp = nowIso();
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO pro_imap_messages
           (mailbox_id, message_id, uid, flags_json, internal_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(mailbox.id, message.id, uid, JSON.stringify(flags), timestamp, timestamp, timestamp),
      db
        .prepare(
          "UPDATE pro_imap_mailboxes SET uid_next = MAX(uid_next, ?), updated_at = ? WHERE id = ?"
        )
        .bind(uid + 1, timestamp, mailbox.id)
    ]);
  }
}

function fallbackRaw(row: SnapshotMessageRow): string {
  const recipients = (JSON.parse(row.to_json) as string[]).join(", ");
  return `From: ${row.from_address}\r\nTo: ${recipients}\r\nSubject: ${row.subject}\r\nMessage-ID: ${row.message_id ?? `<${row.id}@hqbase.local>`}\r\n\r\n${row.text_body}\r\n`;
}

export async function buildSnapshot(env: WorkerEnv, userId: string) {
  const mailboxes = await ensureMailboxes(env.DB, userId);
  return {
    mailboxes: await Promise.all(
      mailboxes.map(async (mailbox) => {
        await synchronizeUIDs(env.DB, mailbox);
        const result = await env.DB.prepare(
          `SELECT m.id, im.uid, im.flags_json, im.internal_date, m.raw_r2_key,
                    m.from_address, m.to_json, m.subject, m.text_body, m.message_id
             FROM pro_imap_messages im JOIN messages m ON m.id = im.message_id
             WHERE im.mailbox_id = ? ORDER BY im.uid`
        )
          .bind(mailbox.id)
          .all<SnapshotMessageRow>();
        const messages = await Promise.all(
          result.results.map(async (message) => {
            const stored = message.raw_r2_key
              ? await env.MAIL_OBJECTS.get(message.raw_r2_key)
              : null;
            const raw = stored
              ? await stored.arrayBuffer()
              : new TextEncoder().encode(fallbackRaw(message));
            return {
              uid: message.uid,
              flags: JSON.parse(message.flags_json),
              internalDate: message.internal_date,
              raw: encodeBase64(raw)
            };
          })
        );
        return {
          name: mailbox.name,
          ...(mailbox.special_use ? { specialUse: mailbox.special_use } : {}),
          messages
        };
      })
    )
  };
}
