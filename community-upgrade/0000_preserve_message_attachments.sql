CREATE TABLE IF NOT EXISTS _hqbase_upgrade_message_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_id TEXT,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR REPLACE INTO _hqbase_upgrade_message_attachments
  (id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
SELECT id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at
FROM message_attachments;
