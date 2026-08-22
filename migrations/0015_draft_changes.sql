-- Durable draft change journal for GET /api/v1/drafts/changes.
-- Journal rows have no foreign key to drafts so deletion tombstones survive hard deletes.

DROP INDEX IF EXISTS drafts_user_updated_idx;

CREATE INDEX IF NOT EXISTS drafts_user_updated_id_idx
ON drafts(user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS draft_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS draft_changes_user_sequence_idx
ON draft_changes(user_id, sequence);

CREATE TRIGGER IF NOT EXISTS draft_changes_after_insert
AFTER INSERT ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, kind, changed_at)
  VALUES (NEW.id, NEW.user_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS draft_changes_after_update
AFTER UPDATE ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, kind, changed_at)
  VALUES (NEW.id, NEW.user_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS draft_changes_after_delete
AFTER DELETE ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, kind, changed_at)
  VALUES (OLD.id, OLD.user_id, 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS draft_changes_after_attachment_insert
AFTER INSERT ON draft_attachments
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, kind, changed_at)
  SELECT id, user_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = NEW.draft_id;
END;

CREATE TRIGGER IF NOT EXISTS draft_changes_after_attachment_delete
AFTER DELETE ON draft_attachments
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, kind, changed_at)
  SELECT id, user_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = OLD.draft_id;
END;
