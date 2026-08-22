-- Durable message change journal for GET /api/v1/changes.
-- Journal rows have no foreign key to messages so deletion tombstones survive retention.

CREATE TABLE IF NOT EXISTS message_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  mailbox_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
  changed_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS message_changes_after_insert
AFTER INSERT ON messages
BEGIN
  INSERT INTO message_changes (message_id, mailbox_id, kind, changed_at)
  VALUES (NEW.id, NEW.mailbox_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS message_changes_after_update
AFTER UPDATE ON messages
BEGIN
  INSERT INTO message_changes (message_id, mailbox_id, kind, changed_at)
  VALUES (NEW.id, NEW.mailbox_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS message_changes_after_delete
AFTER DELETE ON messages
BEGIN
  INSERT INTO message_changes (message_id, mailbox_id, kind, changed_at)
  VALUES (OLD.id, OLD.mailbox_id, 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
