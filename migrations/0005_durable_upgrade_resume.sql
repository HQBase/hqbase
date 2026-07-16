PRAGMA foreign_keys = ON;

ALTER TABLE community_pro_upgrades ADD COLUMN continuation_ciphertext TEXT;

UPDATE app_release_state
SET installed_schema_version = 5, updated_at = datetime('now')
WHERE singleton = 1 AND edition = 'community';
