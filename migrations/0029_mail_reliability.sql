ALTER TABLE messages ADD COLUMN text_r2_key TEXT;
ALTER TABLE messages ADD COLUMN reply_to_json TEXT NOT NULL DEFAULT '[]';
CREATE INDEX messages_text_r2_key_idx ON messages(text_r2_key) WHERE text_r2_key IS NOT NULL;
CREATE INDEX messages_html_r2_key_idx ON messages(html_r2_key) WHERE html_r2_key IS NOT NULL;
CREATE INDEX messages_raw_r2_key_idx ON messages(raw_r2_key) WHERE raw_r2_key IS NOT NULL;
CREATE INDEX message_attachments_r2_key_idx ON message_attachments(r2_key);

CREATE TABLE send_operations (
  id TEXT PRIMARY KEY NOT NULL,
  principal_id TEXT,
  draft_id TEXT,
  mailbox_id TEXT,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'accepted', 'stored', 'unknown')),
  message_id TEXT NOT NULL,
  provider_message_id TEXT,
  payload_r2_key TEXT NOT NULL UNIQUE,
  receipt_r2_key TEXT NOT NULL UNIQUE,
  object_keys_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX send_operations_draft_idx ON send_operations(principal_id, draft_id)
  WHERE draft_id IS NOT NULL;
CREATE INDEX send_operations_status_idx ON send_operations(status, updated_at);

ALTER TABLE operation_runs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operation_runs ADD COLUMN lease_token TEXT;
ALTER TABLE operation_runs ADD COLUMN lease_expires_at TEXT;
