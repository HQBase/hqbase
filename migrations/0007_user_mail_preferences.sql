PRAGMA foreign_keys = ON;

CREATE TABLE user_mail_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  default_from_mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX user_mail_preferences_default_from_idx
ON user_mail_preferences(default_from_mailbox_id);
