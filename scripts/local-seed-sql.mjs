export const messageColumns = [
  "id",
  "thread_id",
  "mailbox_id",
  "direction",
  "folder",
  "from_address",
  "to_json",
  "cc_json",
  "bcc_json",
  "subject",
  "snippet",
  "text_body",
  "html_r2_key",
  "raw_r2_key",
  "message_id",
  "dedupe_key",
  "in_reply_to",
  "references_json",
  "received_at",
  "sent_at",
  "read_at",
  "starred_at",
  "archived_at",
  "trashed_at",
  "has_attachments",
  "created_at",
  "updated_at",
  "delivered_to_address"
];

export function insert(table, columns, values) {
  return `INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${values.map(sqlValue).join(", ")});`;
}

export function upsert(table, columns, values, conflictColumns, updateColumns) {
  return `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${values.map(sqlValue).join(", ")}) ON CONFLICT (${conflictColumns.map(quoteIdentifier).join(", ")}) DO UPDATE SET ${updateColumns.map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ")};`;
}

export function messageValues(input, seedTimestamp) {
  return [
    input.id,
    input.threadId,
    input.mailboxId,
    input.direction,
    input.folder,
    input.from,
    input.to,
    input.cc ?? [],
    input.bcc ?? [],
    input.subject,
    input.snippet,
    input.text,
    null,
    null,
    input.messageId,
    input.dedupeKey,
    input.inReplyTo ?? null,
    input.references ?? [],
    input.receivedAt ?? null,
    input.sentAt ?? null,
    input.readAt ?? null,
    input.starredAt ?? null,
    input.archivedAt ?? null,
    input.trashedAt ?? null,
    0,
    input.receivedAt ?? input.sentAt ?? seedTimestamp,
    input.receivedAt ?? input.sentAt ?? seedTimestamp,
    input.deliveredToAddress ?? null
  ];
}

function quoteIdentifier(value) {
  return value.startsWith('"') ? value : `"${value.replaceAll('"', '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return `'${(Array.isArray(value) ? JSON.stringify(value) : String(value)).replaceAll("'", "''")}'`;
}
