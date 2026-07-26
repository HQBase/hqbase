PRAGMA foreign_keys = ON;

CREATE TABLE hqbase_schema_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO hqbase_schema_state (key, value, updated_at)
VALUES ('product', 'hqbase', datetime('now'));

CREATE TABLE mailbox_grants (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('read', 'agent', 'manager')),
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_id, user_id)
);

CREATE INDEX mailbox_grants_user_idx
ON mailbox_grants(user_id, access_level, mailbox_id);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'operator')),
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_events_time_idx ON audit_events(occurred_at DESC);
CREATE INDEX audit_events_resource_idx
ON audit_events(resource_type, resource_id, occurred_at DESC);

CREATE TABLE rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, subject_hash, window_start)
);

CREATE INDEX rate_limits_expiry_idx ON rate_limits(expires_at);

CREATE TABLE retention_policies (
  mailbox_id TEXT PRIMARY KEY NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  message_days INTEGER CHECK (message_days IS NULL OR message_days >= 1),
  trash_days INTEGER NOT NULL DEFAULT 30 CHECK (trash_days >= 1),
  updated_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL
);

CREATE TABLE operation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  cursor TEXT,
  counters_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX operation_runs_kind_idx ON operation_runs(kind, started_at DESC);

CREATE TABLE deployment_state (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workspace_hosts (
  id TEXT PRIMARY KEY NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  zone_id TEXT,
  kind TEXT NOT NULL CHECK (kind = 'portal'),
  is_canonical INTEGER NOT NULL DEFAULT 0 CHECK (is_canonical IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'degraded', 'disabled')),
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX workspace_hosts_canonical_portal_idx
ON workspace_hosts(kind) WHERE kind = 'portal' AND is_canonical = 1;

CREATE TABLE mail_domains (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  zone_id TEXT,
  account_id TEXT,
  receiving_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (receiving_status IN ('pending', 'ready', 'degraded', 'disabled')),
  sending_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sending_status IN ('pending', 'ready', 'degraded', 'disabled')),
  dns_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (dns_status IN ('pending', 'ready', 'degraded')),
  catch_all_policy TEXT NOT NULL DEFAULT 'reject'
    CHECK (catch_all_policy IN ('reject', 'mailbox', 'unassigned')),
  catch_all_mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE SET NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  last_error_code TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE mailbox_addresses (
  id TEXT PRIMARY KEY NOT NULL,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  mail_domain_id TEXT NOT NULL REFERENCES mail_domains(id) ON DELETE RESTRICT,
  local_part TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  receive_enabled INTEGER NOT NULL DEFAULT 1 CHECK (receive_enabled IN (0, 1)),
  send_enabled INTEGER NOT NULL DEFAULT 1 CHECK (send_enabled IN (0, 1)),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (mail_domain_id, local_part)
);

CREATE INDEX mailbox_addresses_mailbox_idx
ON mailbox_addresses(mailbox_id, is_primary DESC, address);

CREATE UNIQUE INDEX mailbox_addresses_primary_idx
ON mailbox_addresses(mailbox_id) WHERE is_primary = 1;

CREATE TABLE domain_setup_operations (
  id TEXT PRIMARY KEY,
  mail_domain_id TEXT REFERENCES mail_domains(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('provision', 'verify', 'disable', 'remove', 'portal-cutover')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  steps_json TEXT NOT NULL DEFAULT '[]',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE messages
ADD COLUMN delivered_to_address_id TEXT REFERENCES mailbox_addresses(id) ON DELETE SET NULL;

ALTER TABLE messages
ADD COLUMN sent_from_address_id TEXT REFERENCES mailbox_addresses(id) ON DELETE SET NULL;

CREATE TABLE drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE SET NULL,
  reply_to_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  from_address TEXT NOT NULL DEFAULT '',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX drafts_user_updated_idx ON drafts(user_id, updated_at DESC);

CREATE TABLE draft_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX draft_attachments_draft_idx ON draft_attachments(draft_id, created_at);

CREATE TABLE installation_identity (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  installation_id TEXT NOT NULL UNIQUE,
  worker_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE release_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  product TEXT NOT NULL CHECK (product = 'hqbase'),
  installed_version TEXT NOT NULL,
  installed_schema_version INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel = 'stable'),
  updated_at TEXT NOT NULL
);

INSERT INTO release_state
  (singleton, product, installed_version, installed_schema_version, channel, updated_at)
VALUES (1, 'hqbase', '0.1.11', 2, 'stable', datetime('now'));

CREATE TABLE update_history (
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

CREATE TABLE message_sender_preferences (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sender_address TEXT NOT NULL COLLATE NOCASE,
  load_remote_media INTEGER NOT NULL DEFAULT 0 CHECK (load_remote_media IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, sender_address)
);

CREATE TABLE oauthClient (
  id TEXT PRIMARY KEY NOT NULL,
  clientId TEXT NOT NULL UNIQUE,
  clientSecret TEXT,
  disabled INTEGER DEFAULT 0,
  skipConsent INTEGER,
  enableEndSession INTEGER,
  subjectType TEXT,
  scopes TEXT,
  userId TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  createdAt TEXT,
  updatedAt TEXT,
  name TEXT,
  uri TEXT,
  icon TEXT,
  contacts TEXT,
  tos TEXT,
  policy TEXT,
  softwareId TEXT,
  softwareVersion TEXT,
  softwareStatement TEXT,
  redirectUris TEXT NOT NULL,
  postLogoutRedirectUris TEXT,
  tokenEndpointAuthMethod TEXT,
  grantTypes TEXT,
  responseTypes TEXT,
  public INTEGER,
  type TEXT,
  requirePKCE INTEGER,
  referenceId TEXT,
  metadata TEXT
);

CREATE INDEX oauthClient_userId_idx ON oauthClient(userId);

CREATE TABLE oauthRefreshToken (
  id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL UNIQUE,
  clientId TEXT NOT NULL REFERENCES oauthClient(clientId) ON DELETE CASCADE,
  sessionId TEXT REFERENCES "session"(id) ON DELETE SET NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  referenceId TEXT,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  revoked TEXT,
  authTime TEXT,
  scopes TEXT NOT NULL
);

CREATE INDEX oauthRefreshToken_clientId_idx ON oauthRefreshToken(clientId);
CREATE INDEX oauthRefreshToken_sessionId_idx ON oauthRefreshToken(sessionId);
CREATE INDEX oauthRefreshToken_userId_idx ON oauthRefreshToken(userId);

CREATE TABLE oauthAccessToken (
  id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL UNIQUE,
  clientId TEXT NOT NULL REFERENCES oauthClient(clientId) ON DELETE CASCADE,
  sessionId TEXT REFERENCES "session"(id) ON DELETE SET NULL,
  userId TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  referenceId TEXT,
  refreshId TEXT REFERENCES oauthRefreshToken(id) ON DELETE CASCADE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  scopes TEXT NOT NULL
);

CREATE INDEX oauthAccessToken_clientId_idx ON oauthAccessToken(clientId);
CREATE INDEX oauthAccessToken_sessionId_idx ON oauthAccessToken(sessionId);
CREATE INDEX oauthAccessToken_userId_idx ON oauthAccessToken(userId);
CREATE INDEX oauthAccessToken_refreshId_idx ON oauthAccessToken(refreshId);

CREATE TABLE oauthConsent (
  id TEXT PRIMARY KEY NOT NULL,
  clientId TEXT NOT NULL REFERENCES oauthClient(clientId) ON DELETE CASCADE,
  userId TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  referenceId TEXT,
  scopes TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX oauthConsent_clientId_idx ON oauthConsent(clientId);
CREATE INDEX oauthConsent_userId_idx ON oauthConsent(userId);
