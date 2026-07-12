PRAGMA foreign_keys = ON;

CREATE TABLE pro_upgrade_lifecycle (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  source_edition TEXT NOT NULL CHECK (source_edition IN ('community')),
  state TEXT NOT NULL CHECK (state IN ('migrated', 'deployed', 'cutover_verified')),
  checkpoint_bookmark TEXT NOT NULL,
  backup_r2_key TEXT NOT NULL,
  source_worker_name TEXT,
  target_worker_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  migrated_at TEXT NOT NULL,
  deployed_at TEXT,
  cutover_verified_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO pro_schema_state (key, value, updated_at)
VALUES ('upgrade_lifecycle', '0008', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
