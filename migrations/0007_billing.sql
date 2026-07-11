CREATE TABLE pro_entitlement (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  installation_id TEXT NOT NULL UNIQUE,
  activation_id TEXT,
  display_key TEXT,
  encrypted_license_key TEXT,
  state TEXT NOT NULL CHECK (
    state IN ('unlicensed', 'active', 'canceling', 'past_due', 'grace', 'inactive')
  ),
  can_configure INTEGER NOT NULL DEFAULT 1,
  current_period_end TEXT,
  checked_at TEXT,
  next_check_at TEXT,
  grace_ends_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO pro_schema_state (key, value, updated_at)
VALUES ('billing_entitlements', '0007', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
