PRAGMA foreign_keys = OFF;

CREATE TABLE messages_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent', 'drafts', 'archived', 'trash', 'catchall')),
  from_address TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL,
  bcc_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_r2_key TEXT,
  raw_r2_key TEXT,
  message_id TEXT,
  dedupe_key TEXT UNIQUE,
  in_reply_to TEXT,
  references_json TEXT NOT NULL,
  received_at TEXT,
  sent_at TEXT,
  read_at TEXT,
  starred_at TEXT,
  archived_at TEXT,
  trashed_at TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO messages_v2 SELECT * FROM messages;
DROP TABLE messages;
ALTER TABLE messages_v2 RENAME TO messages;
CREATE INDEX messages_folder_idx ON messages(folder, created_at);
CREATE INDEX messages_mailbox_idx ON messages(mailbox_id, created_at);
CREATE INDEX messages_message_id_idx ON messages(message_id);
CREATE INDEX messages_dedupe_key_idx ON messages(dedupe_key);

ALTER TABLE pro_imap_mailboxes ADD COLUMN backfill_created_at TEXT;
ALTER TABLE pro_imap_mailboxes ADD COLUMN backfill_message_id TEXT;
ALTER TABLE pro_imap_mailboxes ADD COLUMN backfill_complete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pro_imap_messages ADD COLUMN raw_size INTEGER NOT NULL DEFAULT 0;

CREATE TABLE pro_entitlements (
  key TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT INTO pro_entitlements (key, enabled, updated_at)
VALUES ('mail_bridge', 1, '2026-07-11T00:00:00.000Z');

CREATE TABLE pro_message_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX pro_message_changes_message_idx
ON pro_message_changes(message_id, seq);

CREATE TABLE pro_imap_events (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source_seq INTEGER NOT NULL REFERENCES pro_message_changes(seq) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('upsert', 'flags', 'expunge')),
  mailbox_id TEXT NOT NULL,
  uid INTEGER NOT NULL,
  flags_json TEXT,
  internal_date TEXT,
  size_bytes INTEGER,
  PRIMARY KEY (user_id, source_seq, ordinal)
);

CREATE INDEX pro_imap_events_cursor_idx
ON pro_imap_events(user_id, source_seq);

INSERT INTO pro_schema_state (key, value, updated_at)
VALUES ('mail_bridge_contract', 'v2', '2026-07-11T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

PRAGMA foreign_keys = ON;
