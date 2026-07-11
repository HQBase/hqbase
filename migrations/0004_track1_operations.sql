PRAGMA foreign_keys = ON;

CREATE TABLE pro_mailbox_grants (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('read', 'agent', 'manager')),
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_id, user_id)
);

CREATE INDEX pro_mailbox_grants_user_idx
ON pro_mailbox_grants(user_id, access_level, mailbox_id);

INSERT INTO pro_mailbox_grants
  (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
SELECT m.id, u.id, 'agent', actor.id, datetime('now'), datetime('now')
FROM mailboxes m
JOIN "user" u ON COALESCE(u.role, 'member') <> 'owner'
JOIN (
  SELECT id FROM "user"
  ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, createdAt
  LIMIT 1
) actor
WHERE COALESCE(u.banned, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM pro_mailbox_grants g WHERE g.mailbox_id = m.id AND g.user_id = u.id
  );

CREATE TABLE pro_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'bridge', 'system', 'operator')),
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX pro_audit_events_time_idx ON pro_audit_events(occurred_at DESC);
CREATE INDEX pro_audit_events_resource_idx
ON pro_audit_events(resource_type, resource_id, occurred_at DESC);

CREATE TABLE pro_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, subject_hash, window_start)
);

CREATE INDEX pro_rate_limits_expiry_idx ON pro_rate_limits(expires_at);

CREATE TABLE pro_retention_policies (
  mailbox_id TEXT PRIMARY KEY NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  message_days INTEGER CHECK (message_days IS NULL OR message_days >= 1),
  trash_days INTEGER NOT NULL DEFAULT 30 CHECK (trash_days >= 1),
  updated_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL
);

CREATE TABLE pro_operation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  cursor TEXT,
  counters_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX pro_operation_runs_kind_idx ON pro_operation_runs(kind, started_at DESC);

ALTER TABLE pro_mail_sessions ADD COLUMN last_change_seq INTEGER NOT NULL DEFAULT 0;

CREATE TABLE pro_deployment_state (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO pro_deployment_state (key, value_json, updated_at)
VALUES ('track1', '{"version":1}', datetime('now'));

INSERT INTO pro_schema_state (key, value, updated_at)
VALUES ('track1_operations', '0004', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
