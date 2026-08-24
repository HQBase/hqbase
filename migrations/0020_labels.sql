-- Shared workspace labels and message-level assignments.

CREATE TABLE labels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT COLLATE NOCASE NOT NULL UNIQUE,
  color TEXT NOT NULL CHECK (
    color IN ('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink')
  ),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(name)) BETWEEN 1 AND 80)
);

CREATE TABLE message_labels (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  assigned_by_principal_id TEXT REFERENCES principals(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, label_id)
);

CREATE INDEX message_labels_label_message_idx
ON message_labels(label_id, message_id);
