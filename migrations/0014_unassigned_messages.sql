-- Mark unassigned inbound mail independently from mailbox_id. A mailbox deletion also sets
-- mailbox_id to NULL, so that column cannot safely define owner-only catch-all access.

ALTER TABLE messages
ADD COLUMN is_unassigned INTEGER NOT NULL DEFAULT 0
  CHECK (
    is_unassigned IN (0, 1)
    AND (is_unassigned = 0 OR (mailbox_id IS NULL AND direction = 'inbound'))
  );

UPDATE messages
SET is_unassigned = 1
WHERE direction = 'inbound'
  AND folder = 'catchall'
  AND mailbox_id IS NULL;

ALTER TABLE message_changes
ADD COLUMN is_unassigned INTEGER NOT NULL DEFAULT 0 CHECK (is_unassigned IN (0, 1));

UPDATE message_changes
SET is_unassigned = 1
WHERE mailbox_id IS NULL
  AND EXISTS (
    SELECT 1 FROM messages
    WHERE messages.id = message_changes.message_id
      AND messages.is_unassigned = 1
  );

DROP TRIGGER message_changes_after_insert;
DROP TRIGGER message_changes_after_update;
DROP TRIGGER message_changes_after_delete;

CREATE TRIGGER message_changes_after_insert
AFTER INSERT ON messages
BEGIN
  INSERT INTO message_changes (message_id, mailbox_id, is_unassigned, kind, changed_at)
  VALUES (
    NEW.id, NEW.mailbox_id, NEW.is_unassigned, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER message_changes_after_update
AFTER UPDATE ON messages
BEGIN
  INSERT INTO message_changes (message_id, mailbox_id, is_unassigned, kind, changed_at)
  VALUES (
    NEW.id, NEW.mailbox_id, NEW.is_unassigned, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER message_changes_after_delete
AFTER DELETE ON messages
BEGIN
  INSERT INTO message_changes (message_id, mailbox_id, is_unassigned, kind, changed_at)
  VALUES (
    OLD.id, OLD.mailbox_id, OLD.is_unassigned, 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;
