CREATE TABLE app_release_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  edition TEXT NOT NULL CHECK (edition = 'community'),
  installed_version TEXT NOT NULL,
  installed_schema_version INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel = 'stable'),
  updated_at TEXT NOT NULL
);

INSERT INTO app_release_state
  (singleton, edition, installed_version, installed_schema_version, channel, updated_at)
VALUES (1, 'community', '0.1.1', 2, 'stable', datetime('now'));

CREATE TABLE app_update_history (
  id TEXT PRIMARY KEY,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  checkpoint_bookmark TEXT NOT NULL,
  worker_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('started', 'deployed', 'verified', 'failed')),
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
