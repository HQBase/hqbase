ALTER TABLE drafts
ADD COLUMN forward_of_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_thread_idx
ON messages(thread_id, created_at);

CREATE INDEX IF NOT EXISTS drafts_forward_message_idx
ON drafts(forward_of_message_id);
