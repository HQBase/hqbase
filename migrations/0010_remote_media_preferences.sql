CREATE TABLE IF NOT EXISTS message_sender_preferences (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sender_address TEXT NOT NULL COLLATE NOCASE,
  load_remote_media INTEGER NOT NULL DEFAULT 0 CHECK (load_remote_media IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, sender_address)
);

UPDATE pro_release_state
SET installed_schema_version = 10, updated_at = datetime('now')
WHERE singleton = 1;

INSERT INTO pro_schema_state (key, value, updated_at)
VALUES ('remote_media_preferences', '0010', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
