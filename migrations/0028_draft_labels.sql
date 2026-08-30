-- Private label assignments for saved drafts.

-- The draft foreign key is added in the after-deploy phase. This keeps assignments intact while
-- the historical principal finalizer rebuilds the drafts table on a fresh installation.
CREATE TABLE draft_labels (
  draft_id TEXT NOT NULL,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  assigned_by_principal_id TEXT REFERENCES principals(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (draft_id, label_id)
);

CREATE INDEX draft_labels_label_draft_idx
ON draft_labels(label_id, draft_id);

CREATE TRIGGER draft_changes_after_label_insert
AFTER INSERT ON draft_labels
BEGIN
  INSERT INTO draft_changes (draft_id, principal_id, kind, changed_at)
  SELECT id, principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = NEW.draft_id;
END;

CREATE TRIGGER draft_changes_after_label_delete
AFTER DELETE ON draft_labels
BEGIN
  INSERT INTO draft_changes (draft_id, principal_id, kind, changed_at)
  SELECT id, principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = OLD.draft_id;
END;
