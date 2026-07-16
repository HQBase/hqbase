PRAGMA foreign_keys = ON;

CREATE TABLE installation_identity (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  installation_id TEXT NOT NULL UNIQUE,
  worker_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE community_pro_upgrades (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  workspace_origin TEXT NOT NULL,
  install_mode TEXT NOT NULL CHECK (install_mode = 'community_upgrade'),
  purchase_nonce_hash TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'created', 'purchase_verified', 'cloudflare_authorized', 'target_verified',
    'backup_complete', 'resources_prepared', 'migration_started', 'migration_complete',
    'candidate_uploaded', 'candidate_verified', 'promoted', 'complete', 'failed',
    'recovery_required'
  )),
  legacy_recovery INTEGER NOT NULL DEFAULT 0 CHECK (legacy_recovery IN (0, 1)),
  legacy_confirmed_at TEXT,
  account_id TEXT,
  active_version_id TEXT,
  candidate_version_id TEXT,
  preview_alias TEXT,
  d1_database_id TEXT,
  r2_bucket_name TEXT,
  checkpoint_bookmark TEXT,
  backup_r2_key TEXT,
  inventory_json TEXT,
  created_resources_json TEXT NOT NULL DEFAULT '[]',
  preflight_counts_json TEXT,
  error_code TEXT,
  recovery_action TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX community_pro_upgrades_installation_idx
ON community_pro_upgrades (installation_id, created_at DESC);

CREATE UNIQUE INDEX community_pro_upgrades_active_lock_idx
ON community_pro_upgrades (installation_id)
WHERE state NOT IN ('complete', 'failed', 'recovery_required');

CREATE TABLE community_pro_upgrade_audit (
  id TEXT PRIMARY KEY,
  upgrade_id TEXT NOT NULL REFERENCES community_pro_upgrades(id) ON DELETE CASCADE,
  transition TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);

CREATE INDEX community_pro_upgrade_audit_upgrade_idx
ON community_pro_upgrade_audit (upgrade_id, occurred_at);

UPDATE app_release_state
SET installed_schema_version = 4, updated_at = datetime('now')
WHERE singleton = 1 AND edition = 'community';
