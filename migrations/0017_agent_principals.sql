-- Add machine principals without breaking the Worker that is active during deployment.

PRAGMA defer_foreign_keys = ON;

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

-- Retain both grant identities until the new Worker is active. Each Worker keeps the other
-- identity current, so either version can read human grants during the deployment window.
DROP TRIGGER mailbox_grants_transition_insert_guard;
DROP TRIGGER mailbox_grants_transition_update_guard;
DROP TRIGGER mailbox_grants_transition_delete_guard;
DROP INDEX mailbox_grants_user_idx;

ALTER TABLE mailbox_grants RENAME TO mailbox_grants_agent_transition;

CREATE TABLE mailbox_grants (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  principal_id TEXT REFERENCES principals(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('read', 'agent', 'manager')),
  created_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  created_by_principal_id TEXT REFERENCES principals(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_id, principal_id),
  UNIQUE (mailbox_id, user_id),
  CHECK (user_id IS NOT NULL OR principal_id IS NOT NULL),
  CHECK (created_by IS NOT NULL OR created_by_principal_id IS NOT NULL)
);

INSERT INTO mailbox_grants (
  mailbox_id,
  user_id,
  principal_id,
  access_level,
  created_by,
  created_by_principal_id,
  created_at,
  updated_at
)
SELECT
  mailbox_id,
  user_id,
  user_id,
  access_level,
  created_by,
  created_by,
  created_at,
  updated_at
FROM mailbox_grants_agent_transition;

DROP TABLE mailbox_grants_agent_transition;

CREATE INDEX mailbox_grants_user_idx
ON mailbox_grants(user_id, access_level, mailbox_id);

CREATE INDEX mailbox_grants_principal_idx
ON mailbox_grants(principal_id, access_level, mailbox_id);

CREATE TRIGGER mailbox_grants_identity_insert_guard
BEFORE INSERT ON mailbox_grants
WHEN (NEW.user_id IS NOT NULL AND NEW.principal_id IS NOT NULL
      AND NEW.user_id <> NEW.principal_id)
  OR (NEW.created_by IS NOT NULL AND NEW.created_by_principal_id IS NOT NULL
      AND NEW.created_by <> NEW.created_by_principal_id)
BEGIN
  SELECT RAISE(ABORT, 'MAILBOX_GRANT_IDENTITY_MISMATCH');
END;

CREATE TRIGGER mailbox_grants_after_insert_sync
AFTER INSERT ON mailbox_grants
WHEN NEW.principal_id IS NULL
  OR NEW.created_by_principal_id IS NULL
  OR (NEW.user_id IS NULL AND EXISTS (
    SELECT 1 FROM principals WHERE id = NEW.principal_id AND type = 'user'
  ))
  OR (NEW.created_by IS NULL AND EXISTS (
    SELECT 1 FROM principals WHERE id = NEW.created_by_principal_id AND type = 'user'
  ))
BEGIN
  UPDATE mailbox_grants
  SET user_id = COALESCE(
        NEW.user_id,
        (SELECT id FROM principals WHERE id = NEW.principal_id AND type = 'user')
      ),
      principal_id = COALESCE(NEW.principal_id, NEW.user_id),
      created_by = COALESCE(
        NEW.created_by,
        (SELECT id FROM principals
         WHERE id = NEW.created_by_principal_id AND type = 'user')
      ),
      created_by_principal_id = COALESCE(NEW.created_by_principal_id, NEW.created_by)
  WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER mailbox_grants_after_legacy_identity_update
AFTER UPDATE OF user_id, created_by ON mailbox_grants
WHEN (NEW.user_id IS NOT NULL AND NEW.principal_id IS NOT NEW.user_id)
  OR (NEW.created_by IS NOT NULL AND NEW.created_by_principal_id IS NOT NEW.created_by)
BEGIN
  UPDATE mailbox_grants
  SET principal_id = COALESCE(NEW.user_id, NEW.principal_id),
      created_by_principal_id = COALESCE(NEW.created_by, NEW.created_by_principal_id)
  WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER mailbox_grants_after_principal_identity_update
AFTER UPDATE OF principal_id, created_by_principal_id ON mailbox_grants
WHEN NEW.user_id IS NOT (
    SELECT id FROM principals WHERE id = NEW.principal_id AND type = 'user'
  )
  OR NEW.created_by IS NOT (
    SELECT id FROM principals WHERE id = NEW.created_by_principal_id AND type = 'user'
  )
BEGIN
  UPDATE mailbox_grants
  SET user_id = (
        SELECT id FROM principals WHERE id = NEW.principal_id AND type = 'user'
      ),
      created_by = (
        SELECT id FROM principals
        WHERE id = NEW.created_by_principal_id AND type = 'user'
      )
  WHERE rowid = NEW.rowid;
END;

-- Recreate the one-address migration guards on the replacement grant table.
CREATE TRIGGER mailbox_grants_transition_insert_guard
BEFORE INSERT ON mailbox_grants
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id = NEW.mailbox_id OR address.target_mailbox_id = NEW.mailbox_id
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER mailbox_grants_transition_update_guard
BEFORE UPDATE ON mailbox_grants
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id IN (OLD.mailbox_id, NEW.mailbox_id)
     OR address.target_mailbox_id IN (OLD.mailbox_id, NEW.mailbox_id)
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER mailbox_grants_transition_delete_guard
BEFORE DELETE ON mailbox_grants
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id = OLD.mailbox_id
     OR address.target_mailbox_id = OLD.mailbox_id
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

-- Retain both draft owners until deployment finishes. Journal triggers write both identities and
-- ignore the internal update that fills the missing compatibility column.
DROP TRIGGER IF EXISTS draft_changes_after_insert;
DROP TRIGGER IF EXISTS draft_changes_after_update;
DROP TRIGGER IF EXISTS draft_changes_after_delete;
DROP TRIGGER IF EXISTS draft_changes_after_attachment_insert;
DROP TRIGGER IF EXISTS draft_changes_after_attachment_delete;

DROP INDEX IF EXISTS drafts_user_updated_id_idx;
DROP INDEX IF EXISTS drafts_forward_message_idx;
DROP INDEX IF EXISTS draft_attachments_draft_idx;
DROP INDEX IF EXISTS draft_changes_user_sequence_idx;

ALTER TABLE draft_attachments RENAME TO draft_attachments_agent_transition;
ALTER TABLE drafts RENAME TO drafts_agent_transition;
ALTER TABLE draft_changes RENAME TO draft_changes_agent_transition;

CREATE TABLE drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  principal_id TEXT REFERENCES principals(id) ON DELETE CASCADE,
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
  forward_of_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  CHECK (user_id IS NOT NULL OR principal_id IS NOT NULL)
);

CREATE INDEX drafts_user_updated_id_idx
ON drafts(user_id, updated_at DESC, id DESC);

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
  user_id TEXT,
  principal_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
  changed_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR principal_id IS NOT NULL)
);

CREATE INDEX draft_changes_user_sequence_idx
ON draft_changes(user_id, sequence);

CREATE INDEX draft_changes_principal_sequence_idx
ON draft_changes(principal_id, sequence);

INSERT INTO drafts (
  id,
  user_id,
  principal_id,
  mailbox_id,
  reply_to_message_id,
  from_address,
  to_json,
  cc_json,
  bcc_json,
  subject,
  text_body,
  html_body,
  version,
  created_at,
  updated_at,
  forward_of_message_id
)
SELECT
  id,
  user_id,
  user_id,
  mailbox_id,
  reply_to_message_id,
  from_address,
  to_json,
  cc_json,
  bcc_json,
  subject,
  text_body,
  html_body,
  version,
  created_at,
  updated_at,
  forward_of_message_id
FROM drafts_agent_transition;

INSERT INTO draft_attachments (
  id, draft_id, filename, content_type, size_bytes, r2_key, created_at
)
SELECT id, draft_id, filename, content_type, size_bytes, r2_key, created_at
FROM draft_attachments_agent_transition;

INSERT INTO draft_changes (sequence, draft_id, user_id, principal_id, kind, changed_at)
SELECT sequence, draft_id, user_id, user_id, kind, changed_at
FROM draft_changes_agent_transition;

DROP TABLE draft_attachments_agent_transition;
DROP TABLE drafts_agent_transition;
DROP TABLE draft_changes_agent_transition;

CREATE TRIGGER drafts_identity_insert_guard
BEFORE INSERT ON drafts
WHEN NEW.user_id IS NOT NULL AND NEW.principal_id IS NOT NULL
  AND NEW.user_id <> NEW.principal_id
BEGIN
  SELECT RAISE(ABORT, 'DRAFT_IDENTITY_MISMATCH');
END;

CREATE TRIGGER drafts_after_insert_sync_ownership
AFTER INSERT ON drafts
WHEN NEW.principal_id IS NULL
  OR (NEW.user_id IS NULL AND EXISTS (
    SELECT 1 FROM principals WHERE id = NEW.principal_id AND type = 'user'
  ))
BEGIN
  UPDATE drafts
  SET user_id = COALESCE(
        NEW.user_id,
        (SELECT id FROM principals WHERE id = NEW.principal_id AND type = 'user')
      ),
      principal_id = COALESCE(NEW.principal_id, NEW.user_id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER drafts_after_legacy_owner_update
AFTER UPDATE OF user_id ON drafts
WHEN NEW.user_id IS NOT NULL AND NEW.principal_id IS NOT NEW.user_id
BEGIN
  UPDATE drafts SET principal_id = NEW.user_id WHERE id = NEW.id;
END;

CREATE TRIGGER drafts_after_principal_owner_update
AFTER UPDATE OF principal_id ON drafts
WHEN NEW.user_id IS NOT (
  SELECT id FROM principals WHERE id = NEW.principal_id AND type = 'user'
)
BEGIN
  UPDATE drafts
  SET user_id = (
    SELECT id FROM principals WHERE id = NEW.principal_id AND type = 'user'
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER draft_changes_after_insert
AFTER INSERT ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, principal_id, kind, changed_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.user_id,
      (SELECT id FROM principals WHERE id = NEW.principal_id AND type = 'user')
    ),
    COALESCE(NEW.principal_id, NEW.user_id),
    'upsert',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER draft_changes_after_update
AFTER UPDATE ON drafts
WHEN NEW.user_id IS OLD.user_id AND NEW.principal_id IS OLD.principal_id
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, principal_id, kind, changed_at)
  VALUES (
    NEW.id,
    NEW.user_id,
    NEW.principal_id,
    'upsert',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER draft_changes_after_delete
AFTER DELETE ON drafts
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, principal_id, kind, changed_at)
  VALUES (
    OLD.id,
    OLD.user_id,
    OLD.principal_id,
    'delete',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER draft_changes_after_attachment_insert
AFTER INSERT ON draft_attachments
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, principal_id, kind, changed_at)
  SELECT id, user_id, principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = NEW.draft_id;
END;

CREATE TRIGGER draft_changes_after_attachment_delete
AFTER DELETE ON draft_attachments
BEGIN
  INSERT INTO draft_changes (draft_id, user_id, principal_id, kind, changed_at)
  SELECT id, user_id, principal_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts
  WHERE id = OLD.draft_id;
END;

-- Add machine agents as an explicit audit actor without changing existing audit rows.
DROP INDEX IF EXISTS audit_events_time_idx;
DROP INDEX IF EXISTS audit_events_resource_idx;
ALTER TABLE audit_events RENAME TO audit_events_agent_transition;

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
  id,
  occurred_at,
  correlation_id,
  actor_type,
  actor_id,
  action,
  resource_type,
  resource_id,
  outcome,
  metadata_json
)
SELECT
  id,
  occurred_at,
  correlation_id,
  actor_type,
  actor_id,
  action,
  resource_type,
  resource_id,
  outcome,
  metadata_json
FROM audit_events_agent_transition;

DROP TABLE audit_events_agent_transition;

CREATE INDEX audit_events_time_idx ON audit_events(occurred_at DESC);
CREATE INDEX audit_events_resource_idx
ON audit_events(resource_type, resource_id, occurred_at DESC);

PRAGMA foreign_key_check;
PRAGMA optimize;
