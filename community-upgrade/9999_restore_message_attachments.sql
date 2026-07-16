INSERT OR IGNORE INTO message_attachments
  (id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
SELECT id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at
FROM _hqbase_upgrade_message_attachments;
