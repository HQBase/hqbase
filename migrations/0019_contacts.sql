-- Private saved contacts. Recent correspondents remain derived from accessible message metadata.

CREATE TABLE contacts (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  email TEXT COLLATE NOCASE NOT NULL,
  name TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, email),
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (name IS NULL OR length(name) <= 200),
  CHECK (length(notes) <= 10000)
);

CREATE INDEX contacts_user_updated_idx
ON contacts(user_id, updated_at DESC, email);
