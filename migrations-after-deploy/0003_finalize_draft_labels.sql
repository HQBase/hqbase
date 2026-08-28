-- Rebind draft labels after the historical principal-ownership migration rebuilds drafts.

DROP TRIGGER IF EXISTS draft_changes_after_label_insert;
DROP TRIGGER IF EXISTS draft_changes_after_label_delete;
DROP INDEX IF EXISTS draft_labels_label_draft_idx;

ALTER TABLE draft_labels RENAME TO draft_labels_principal_transition;

CREATE TABLE draft_labels (
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  assigned_by_principal_id TEXT REFERENCES principals(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (draft_id, label_id)
);

INSERT INTO draft_labels (draft_id, label_id, assigned_by_principal_id, created_at)
SELECT assignment.draft_id, assignment.label_id, assignment.assigned_by_principal_id,
       assignment.created_at
FROM draft_labels_principal_transition assignment
JOIN drafts draft ON draft.id = assignment.draft_id;

DROP TABLE draft_labels_principal_transition;

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

PRAGMA foreign_key_check;
PRAGMA optimize;
