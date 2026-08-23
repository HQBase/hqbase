-- Mark dedicated agent mailboxes and retain deleted mailboxes for recovery.

ALTER TABLE mailboxes
ADD COLUMN kind TEXT NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'agent'));

ALTER TABLE mailboxes
ADD COLUMN deleted_at TEXT;

-- Agent mailbox creation writes the mailbox, agent, and grant with one timestamp. A mailbox that
-- was shared with an agent later remains a human mailbox.
UPDATE mailboxes
SET kind = 'agent'
WHERE EXISTS (
  SELECT 1
  FROM mailbox_grants grant_row
  JOIN agents agent ON agent.principal_id = grant_row.principal_id
  WHERE grant_row.mailbox_id = mailboxes.id
    AND agent.profile = 'mailbox'
    AND agent.created_at = mailboxes.created_at
    AND grant_row.created_at = mailboxes.created_at
);

-- A provisioner can reuse a quota slot after its dedicated child mailbox is deprovisioned.
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

-- Deleting an assigned mailbox closes every existing access path in the same transaction.
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
