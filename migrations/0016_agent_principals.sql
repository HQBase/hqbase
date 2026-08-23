-- Shared principals let people and machine agents use the same mailbox grants and draft model.

CREATE TABLE principals (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('user', 'agent')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO principals (id, type, name, status, created_at, updated_at)
SELECT id, 'user', name,
       IIF(COALESCE(banned, 0) = 1, 'disabled', 'active'),
       createdAt, updatedAt
FROM "user";

CREATE TRIGGER principals_after_user_insert
AFTER INSERT ON "user"
BEGIN
  INSERT INTO principals (id, type, name, status, created_at, updated_at)
  VALUES (
    NEW.id,
    'user',
    NEW.name,
    IIF(COALESCE(NEW.banned, 0) = 1, 'disabled', 'active'),
    NEW.createdAt,
    NEW.updatedAt
  );
END;

CREATE TRIGGER principals_after_user_update
AFTER UPDATE OF name, banned, updatedAt ON "user"
BEGIN
  UPDATE principals
  SET name = NEW.name,
      status = IIF(COALESCE(NEW.banned, 0) = 1, 'disabled', 'active'),
      updated_at = NEW.updatedAt
  WHERE id = NEW.id AND type = 'user';
END;

CREATE TRIGGER principals_after_user_delete
AFTER DELETE ON "user"
BEGIN
  DELETE FROM principals WHERE id = OLD.id AND type = 'user';
END;

CREATE TABLE agents (
  principal_id TEXT PRIMARY KEY NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  profile TEXT NOT NULL CHECK (profile IN ('mailbox', 'provisioner')),
  created_by_principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
  mail_domain_id TEXT NOT NULL REFERENCES mail_domains(id) ON DELETE RESTRICT,
  mailbox_limit INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (profile = 'mailbox' AND mailbox_limit IS NULL)
    OR (profile = 'provisioner' AND mailbox_limit >= 1)
  )
);

CREATE INDEX agents_creator_idx
ON agents(created_by_principal_id, profile, created_at);

CREATE INDEX agents_domain_idx
ON agents(mail_domain_id, profile, created_at);

-- Human-created agents are unrestricted by this trigger. Agent-created children must remain
-- inside the active provisioner's approved domain and lifetime mailbox quota.
CREATE TRIGGER agents_before_agent_created_child
BEFORE INSERT ON agents
WHEN EXISTS (
  SELECT 1 FROM agents parent WHERE parent.principal_id = NEW.created_by_principal_id
)
BEGIN
  SELECT RAISE(ABORT, 'AGENT_PROVISIONER_REQUIRED')
  WHERE (SELECT profile FROM agents WHERE principal_id = NEW.created_by_principal_id)
        <> 'provisioner';
  SELECT RAISE(ABORT, 'AGENT_PROVISIONER_DISABLED')
  WHERE (SELECT status FROM principals WHERE id = NEW.created_by_principal_id) <> 'active';
  SELECT RAISE(ABORT, 'AGENT_CHILD_PROFILE_FORBIDDEN')
  WHERE NEW.profile <> 'mailbox';
  SELECT RAISE(ABORT, 'AGENT_DOMAIN_FORBIDDEN')
  WHERE NEW.mail_domain_id <> (
      SELECT mail_domain_id FROM agents WHERE principal_id = NEW.created_by_principal_id
    );
  SELECT RAISE(ABORT, 'AGENT_MAILBOX_LIMIT_REACHED')
  WHERE (
      SELECT COUNT(*) FROM agents child
      WHERE child.created_by_principal_id = NEW.created_by_principal_id
        AND child.profile = 'mailbox'
    ) >= (
      SELECT mailbox_limit FROM agents WHERE principal_id = NEW.created_by_principal_id
    );
END;

CREATE TABLE agent_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  principal_id TEXT NOT NULL REFERENCES agents(principal_id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL UNIQUE,
  resource TEXT NOT NULL CHECK (resource IN ('mail', 'management')),
  scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json) AND json_type(scopes_json) = 'array'),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT
);

CREATE UNIQUE INDEX agent_credentials_current_resource_idx
ON agent_credentials(principal_id, resource) WHERE revoked_at IS NULL;

CREATE INDEX agent_credentials_principal_idx
ON agent_credentials(principal_id, created_at DESC);

ALTER TABLE mailbox_grants RENAME TO mailbox_grants_legacy;

CREATE TABLE mailbox_grants (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('read', 'agent', 'manager')),
  created_by_principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_id, principal_id)
);

INSERT INTO mailbox_grants (
  mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at
)
SELECT mailbox_id, user_id, access_level, created_by, created_at, updated_at
FROM mailbox_grants_legacy;

DROP TABLE mailbox_grants_legacy;

CREATE INDEX mailbox_grants_principal_idx
ON mailbox_grants(principal_id, access_level, mailbox_id);

-- Rebuild drafts and their child table so ownership points at principals. Drop the old journal
-- triggers first so copying populated installations does not create false changes.
DROP TRIGGER IF EXISTS draft_changes_after_insert;
DROP TRIGGER IF EXISTS draft_changes_after_update;
DROP TRIGGER IF EXISTS draft_changes_after_delete;
DROP TRIGGER IF EXISTS draft_changes_after_attachment_insert;
DROP TRIGGER IF EXISTS draft_changes_after_attachment_delete;

DROP INDEX IF EXISTS drafts_user_updated_id_idx;
DROP INDEX IF EXISTS drafts_forward_message_idx;
DROP INDEX IF EXISTS draft_attachments_draft_idx;
DROP INDEX IF EXISTS draft_changes_user_sequence_idx;

ALTER TABLE draft_attachments RENAME TO draft_attachments_legacy;
ALTER TABLE drafts RENAME TO drafts_legacy;
ALTER TABLE draft_changes RENAME TO draft_changes_legacy;

CREATE TABLE drafts (
  id TEXT PRIMARY KEY NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
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
  updated_at TEXT NOT NULL,
  forward_of_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX drafts_principal_updated_id_idx
ON drafts(principal_id, updated_at DESC, id DESC);

CREATE INDEX drafts_forward_message_idx
ON drafts(forward_of_message_id);

CREATE TABLE draft_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX draft_attachments_draft_idx
ON draft_attachments(draft_id, created_at);

CREATE TABLE draft_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
  changed_at TEXT NOT NULL
);

CREATE INDEX draft_changes_principal_sequence_idx
ON draft_changes(principal_id, sequence);

INSERT INTO drafts (
  id, principal_id, mailbox_id, reply_to_message_id, from_address, to_json, cc_json,
  bcc_json, subject, text_body, html_body, version, created_at, updated_at,
  forward_of_message_id
)
SELECT id, user_id, mailbox_id, reply_to_message_id, from_address, to_json, cc_json,
       bcc_json, subject, text_body, html_body, version, created_at, updated_at,
       forward_of_message_id
FROM drafts_legacy;

INSERT INTO draft_attachments (
  id, draft_id, filename, content_type, size_bytes, r2_key, created_at
)
SELECT id, draft_id, filename, content_type, size_bytes, r2_key, created_at
FROM draft_attachments_legacy;

INSERT INTO draft_changes (sequence, draft_id, principal_id, kind, changed_at)
SELECT sequence, draft_id, user_id, kind, changed_at
FROM draft_changes_legacy;

DROP TABLE draft_attachments_legacy;
DROP TABLE drafts_legacy;
DROP TABLE draft_changes_legacy;

CREATE TRIGGER draft_changes_after_insert
AFTER INSERT ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, principal_id, kind, changed_at)
  VALUES (NEW.id, NEW.principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER draft_changes_after_update
AFTER UPDATE ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, principal_id, kind, changed_at)
  VALUES (NEW.id, NEW.principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER draft_changes_after_delete
AFTER DELETE ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, principal_id, kind, changed_at)
  VALUES (OLD.id, OLD.principal_id, 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER draft_changes_after_attachment_insert
AFTER INSERT ON draft_attachments
BEGIN
  INSERT INTO draft_changes (draft_id, principal_id, kind, changed_at)
  SELECT id, principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = NEW.draft_id;
END;

CREATE TRIGGER draft_changes_after_attachment_delete
AFTER DELETE ON draft_attachments
BEGIN
  INSERT INTO draft_changes (draft_id, principal_id, kind, changed_at)
  SELECT id, principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = OLD.draft_id;
END;

-- Add machine agents as an explicit audit actor without changing existing audit rows.
DROP INDEX IF EXISTS audit_events_time_idx;
DROP INDEX IF EXISTS audit_events_resource_idx;
ALTER TABLE audit_events RENAME TO audit_events_legacy;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system', 'operator')),
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

INSERT INTO audit_events (
  id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
  resource_id, outcome, metadata_json
)
SELECT id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
       resource_id, outcome, metadata_json
FROM audit_events_legacy;

DROP TABLE audit_events_legacy;

CREATE INDEX audit_events_time_idx ON audit_events(occurred_at DESC);
CREATE INDEX audit_events_resource_idx
ON audit_events(resource_type, resource_id, occurred_at DESC);
