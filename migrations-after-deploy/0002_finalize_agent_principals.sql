-- Remove legacy user identity columns after the principal-aware Worker is active.

PRAGMA defer_foreign_keys = ON;

DROP TRIGGER IF EXISTS agents_before_agent_created_child;
DROP TRIGGER IF EXISTS mailboxes_after_soft_delete_agent_access;
DROP TRIGGER IF EXISTS mailbox_grants_before_agent_insert_on_deleted_mailbox;
DROP TRIGGER IF EXISTS mailbox_grants_before_agent_update_on_deleted_mailbox;
DROP TRIGGER IF EXISTS principals_before_agent_reenable_with_deleted_mailbox;
DROP TRIGGER IF EXISTS agent_credentials_before_active_insert_with_deleted_mailbox;
DROP TRIGGER IF EXISTS agent_credentials_before_unrevoke_with_deleted_mailbox;
DROP TRIGGER IF EXISTS mailbox_grants_identity_insert_guard;
DROP TRIGGER IF EXISTS mailbox_grants_after_insert_sync;
DROP TRIGGER IF EXISTS mailbox_grants_after_legacy_identity_update;
DROP TRIGGER IF EXISTS mailbox_grants_after_principal_identity_update;
DROP INDEX IF EXISTS mailbox_grants_user_idx;
DROP INDEX IF EXISTS mailbox_grants_principal_idx;

ALTER TABLE mailbox_grants RENAME TO mailbox_grants_principal_transition;

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
  mailbox_id,
  principal_id,
  access_level,
  created_by_principal_id,
  created_at,
  updated_at
)
SELECT
  mailbox_id,
  principal_id,
  access_level,
  created_by_principal_id,
  created_at,
  updated_at
FROM mailbox_grants_principal_transition;

DROP TABLE mailbox_grants_principal_transition;

CREATE INDEX mailbox_grants_principal_idx
ON mailbox_grants(principal_id, access_level, mailbox_id);

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
    SELECT COUNT(DISTINCT child.principal_id)
    FROM agents child
    JOIN mailbox_grants grant_row ON grant_row.principal_id = child.principal_id
    JOIN mailboxes mailbox ON mailbox.id = grant_row.mailbox_id
    WHERE child.created_by_principal_id = NEW.created_by_principal_id
      AND child.profile = 'mailbox'
      AND mailbox.kind = 'agent'
      AND mailbox.deleted_at IS NULL
  ) >= (
    SELECT mailbox_limit FROM agents WHERE principal_id = NEW.created_by_principal_id
  );
END;

CREATE TRIGGER mailboxes_after_soft_delete_agent_access
AFTER UPDATE OF deleted_at ON mailboxes
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE agent_credentials
  SET revoked_at = NEW.deleted_at
  WHERE revoked_at IS NULL
    AND principal_id IN (
      SELECT grant_row.principal_id
      FROM mailbox_grants grant_row
      JOIN principals principal ON principal.id = grant_row.principal_id
      WHERE grant_row.mailbox_id = NEW.id
        AND principal.type = 'agent'
    );

  UPDATE principals
  SET status = 'disabled',
      updated_at = NEW.deleted_at
  WHERE type = 'agent'
    AND id IN (
      SELECT principal_id FROM mailbox_grants WHERE mailbox_id = NEW.id
    );
END;

CREATE TRIGGER mailbox_grants_before_agent_insert_on_deleted_mailbox
BEFORE INSERT ON mailbox_grants
WHEN EXISTS (
  SELECT 1 FROM principals WHERE id = NEW.principal_id AND type = 'agent'
)
AND (
  EXISTS (
    SELECT 1 FROM mailboxes WHERE id = NEW.mailbox_id AND deleted_at IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM mailbox_grants grant_row
    JOIN mailboxes mailbox ON mailbox.id = grant_row.mailbox_id
    WHERE grant_row.principal_id = NEW.principal_id
      AND mailbox.deleted_at IS NOT NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'AGENT_MAILBOX_DELETED');
END;

CREATE TRIGGER mailbox_grants_before_agent_update_on_deleted_mailbox
BEFORE UPDATE ON mailbox_grants
WHEN EXISTS (
  SELECT 1 FROM principals WHERE id = NEW.principal_id AND type = 'agent'
)
AND (
  EXISTS (
    SELECT 1 FROM mailboxes WHERE id = NEW.mailbox_id AND deleted_at IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM mailbox_grants grant_row
    JOIN mailboxes mailbox ON mailbox.id = grant_row.mailbox_id
    WHERE grant_row.principal_id = NEW.principal_id
      AND mailbox.deleted_at IS NOT NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'AGENT_MAILBOX_DELETED');
END;

CREATE TRIGGER principals_before_agent_reenable_with_deleted_mailbox
BEFORE UPDATE OF status ON principals
WHEN OLD.type = 'agent'
  AND OLD.status <> 'active'
  AND NEW.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM mailbox_grants grant_row
    JOIN mailboxes mailbox ON mailbox.id = grant_row.mailbox_id
    WHERE grant_row.principal_id = OLD.id
      AND mailbox.deleted_at IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'AGENT_MAILBOX_DELETED');
END;

CREATE TRIGGER agent_credentials_before_active_insert_with_deleted_mailbox
BEFORE INSERT ON agent_credentials
WHEN NEW.revoked_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM mailbox_grants grant_row
    JOIN mailboxes mailbox ON mailbox.id = grant_row.mailbox_id
    WHERE grant_row.principal_id = NEW.principal_id
      AND mailbox.deleted_at IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'AGENT_MAILBOX_DELETED');
END;

CREATE TRIGGER agent_credentials_before_unrevoke_with_deleted_mailbox
BEFORE UPDATE OF principal_id, revoked_at ON agent_credentials
WHEN NEW.revoked_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM mailbox_grants grant_row
    JOIN mailboxes mailbox ON mailbox.id = grant_row.mailbox_id
    WHERE grant_row.principal_id = NEW.principal_id
      AND mailbox.deleted_at IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'AGENT_MAILBOX_DELETED');
END;

DROP TRIGGER IF EXISTS drafts_identity_insert_guard;
DROP TRIGGER IF EXISTS drafts_after_insert_sync_ownership;
DROP TRIGGER IF EXISTS drafts_after_legacy_owner_update;
DROP TRIGGER IF EXISTS drafts_after_principal_owner_update;
DROP TRIGGER IF EXISTS draft_changes_after_insert;
DROP TRIGGER IF EXISTS draft_changes_after_update;
DROP TRIGGER IF EXISTS draft_changes_after_delete;
DROP TRIGGER IF EXISTS draft_changes_after_attachment_insert;
DROP TRIGGER IF EXISTS draft_changes_after_attachment_delete;

DROP INDEX IF EXISTS drafts_user_updated_id_idx;
DROP INDEX IF EXISTS drafts_principal_updated_id_idx;
DROP INDEX IF EXISTS drafts_forward_message_idx;
DROP INDEX IF EXISTS draft_attachments_draft_idx;
DROP INDEX IF EXISTS draft_changes_user_sequence_idx;
DROP INDEX IF EXISTS draft_changes_principal_sequence_idx;

ALTER TABLE draft_attachments RENAME TO draft_attachments_principal_transition;
ALTER TABLE drafts RENAME TO drafts_principal_transition;
ALTER TABLE draft_changes RENAME TO draft_changes_principal_transition;

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
  signature_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (signature_mode IN ('automatic', 'selected', 'none')),
  signature_id TEXT REFERENCES email_signatures(id) ON DELETE SET NULL,
  signature_name_snapshot TEXT NOT NULL DEFAULT '',
  signature_html_snapshot TEXT NOT NULL DEFAULT '',
  signature_text_snapshot TEXT NOT NULL DEFAULT '',
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
  id,
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
  signature_mode,
  signature_id,
  signature_name_snapshot,
  signature_html_snapshot,
  signature_text_snapshot,
  version,
  created_at,
  updated_at,
  forward_of_message_id
)
SELECT
  id,
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
  signature_mode,
  signature_id,
  signature_name_snapshot,
  signature_html_snapshot,
  signature_text_snapshot,
  version,
  created_at,
  updated_at,
  forward_of_message_id
FROM drafts_principal_transition;

INSERT INTO draft_attachments (
  id, draft_id, filename, content_type, size_bytes, r2_key, created_at
)
SELECT id, draft_id, filename, content_type, size_bytes, r2_key, created_at
FROM draft_attachments_principal_transition;

INSERT INTO draft_changes (sequence, draft_id, principal_id, kind, changed_at)
SELECT sequence, draft_id, principal_id, kind, changed_at
FROM draft_changes_principal_transition;

DROP TABLE draft_attachments_principal_transition;
DROP TABLE drafts_principal_transition;
DROP TABLE draft_changes_principal_transition;

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

PRAGMA foreign_key_check;
PRAGMA optimize;
