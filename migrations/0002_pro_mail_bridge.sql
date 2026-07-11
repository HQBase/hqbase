PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pro_schema_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO pro_schema_state (key, value, updated_at)
VALUES ('edition', 'pro', '2026-07-11T00:00:00.000Z');

INSERT OR IGNORE INTO pro_schema_state (key, value, updated_at)
VALUES ('community_base', '0001_initial', '2026-07-11T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS pro_app_passwords (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS pro_app_passwords_user_idx
ON pro_app_passwords(user_id, created_at);

CREATE TABLE IF NOT EXISTS pro_mail_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  app_password_id TEXT NOT NULL REFERENCES pro_app_passwords(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS pro_mail_sessions_user_idx
ON pro_mail_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS pro_imap_mailboxes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  special_use TEXT,
  source_folder TEXT,
  uid_validity INTEGER NOT NULL,
  uid_next INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS pro_imap_mailboxes_user_idx
ON pro_imap_mailboxes(user_id, name);

CREATE TABLE IF NOT EXISTS pro_imap_messages (
  mailbox_id TEXT NOT NULL REFERENCES pro_imap_mailboxes(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  uid INTEGER NOT NULL,
  flags_json TEXT NOT NULL,
  internal_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(mailbox_id, message_id),
  UNIQUE(mailbox_id, uid)
);

CREATE INDEX IF NOT EXISTS pro_imap_messages_message_idx
ON pro_imap_messages(message_id);

CREATE TABLE IF NOT EXISTS pro_bridge_submissions (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pro_bridge_mutations (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

