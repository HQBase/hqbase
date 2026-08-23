-- Replace mailbox aliases with one mailbox for each email address.

PRAGMA defer_foreign_keys = ON;

ALTER TABLE mailboxes
ADD COLUMN mail_domain_id TEXT REFERENCES mail_domains(id) ON DELETE RESTRICT;

UPDATE mailboxes
SET mail_domain_id = COALESCE(
  (
    SELECT address.mail_domain_id
    FROM mailbox_addresses address
    WHERE address.mailbox_id = mailboxes.id
      AND lower(address.address) = lower(mailboxes.address)
    LIMIT 1
  ),
  (
    SELECT address.mail_domain_id
    FROM mailbox_addresses address
    WHERE address.mailbox_id = mailboxes.id
      AND address.is_primary = 1
    LIMIT 1
  ),
  (
    SELECT domain.id
    FROM mail_domains domain
    WHERE domain.name = lower(substr(mailboxes.address, instr(mailboxes.address, '@') + 1))
    LIMIT 1
  )
);

-- A NOT NULL insert makes the migration stop instead of guessing an unmatched domain.
CREATE TABLE mailbox_domain_migration_guard (
  mail_domain_id TEXT NOT NULL
);

INSERT INTO mailbox_domain_migration_guard (mail_domain_id)
SELECT mail_domain_id FROM mailboxes;

DROP TABLE mailbox_domain_migration_guard;

CREATE TABLE mailbox_address_migration (
  address_id TEXT PRIMARY KEY NOT NULL,
  source_mailbox_id TEXT NOT NULL,
  target_mailbox_id TEXT NOT NULL UNIQUE,
  mail_domain_id TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  receive_enabled INTEGER NOT NULL,
  send_enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO mailbox_address_migration (
  address_id,
  source_mailbox_id,
  target_mailbox_id,
  mail_domain_id,
  address,
  display_name,
  receive_enabled,
  send_enabled,
  created_at,
  updated_at
)
SELECT
  address.id,
  address.mailbox_id,
  CASE
    WHEN lower(address.address) = lower(mailbox.address) THEN mailbox.id
    ELSE 'mbx_migrated_' || address.id
  END,
  address.mail_domain_id,
  address.address,
  address.display_name,
  address.receive_enabled,
  address.send_enabled,
  address.created_at,
  address.updated_at
FROM mailbox_addresses address
JOIN mailboxes mailbox ON mailbox.id = address.mailbox_id;

INSERT INTO mailboxes (
  id,
  address,
  mail_domain_id,
  display_name,
  is_active,
  created_at,
  updated_at
)
SELECT
  address.target_mailbox_id,
  address.address,
  address.mail_domain_id,
  address.display_name,
  CASE
    WHEN source.is_active = 1
      AND address.receive_enabled = 1
      AND address.send_enabled = 1
    THEN 1
    ELSE 0
  END,
  address.created_at,
  address.updated_at
FROM mailbox_address_migration address
JOIN mailboxes source ON source.id = address.source_mailbox_id
WHERE address.target_mailbox_id <> address.source_mailbox_id;

-- Do not enable a capability that the old primary address disabled. Run this after promoted
-- mailboxes use the source mailbox's original active state.
UPDATE mailboxes
SET is_active = 0
WHERE EXISTS (
  SELECT 1
  FROM mailbox_address_migration address
  WHERE address.source_mailbox_id = mailboxes.id
    AND address.target_mailbox_id = mailboxes.id
    AND (address.receive_enabled = 0 OR address.send_enabled = 0)
);

INSERT INTO mailbox_grants (
  mailbox_id,
  user_id,
  access_level,
  created_by,
  created_at,
  updated_at
)
SELECT
  address.target_mailbox_id,
  grant_row.user_id,
  grant_row.access_level,
  grant_row.created_by,
  grant_row.created_at,
  grant_row.updated_at
FROM mailbox_address_migration address
JOIN mailbox_grants grant_row ON grant_row.mailbox_id = address.source_mailbox_id
WHERE address.target_mailbox_id <> address.source_mailbox_id;

INSERT INTO retention_policies (
  mailbox_id,
  message_days,
  trash_days,
  updated_by,
  updated_at
)
SELECT
  address.target_mailbox_id,
  policy.message_days,
  policy.trash_days,
  policy.updated_by,
  policy.updated_at
FROM mailbox_address_migration address
JOIN retention_policies policy ON policy.mailbox_id = address.source_mailbox_id
WHERE address.target_mailbox_id <> address.source_mailbox_id;

ALTER TABLE messages
ADD COLUMN delivered_to_address TEXT;

UPDATE messages
SET delivered_to_address = (
  SELECT address.address
  FROM mailbox_address_migration address
  WHERE address.address_id = messages.delivered_to_address_id
)
WHERE delivered_to_address_id IS NOT NULL;

UPDATE messages
SET mailbox_id = (
  SELECT address.target_mailbox_id
  FROM mailbox_address_migration address
  WHERE address.address_id = CASE
    WHEN messages.direction = 'inbound' THEN messages.delivered_to_address_id
    ELSE messages.sent_from_address_id
  END
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM mailbox_address_migration address
  WHERE address.address_id = CASE
    WHEN messages.direction = 'inbound' THEN messages.delivered_to_address_id
    ELSE messages.sent_from_address_id
  END
    AND address.target_mailbox_id <> messages.mailbox_id
);

UPDATE messages
SET mailbox_id = (
  SELECT address.target_mailbox_id
  FROM mailbox_address_migration address
  WHERE lower(address.address) = lower(messages.from_address)
  LIMIT 1
)
WHERE direction = 'outbound'
  AND sent_from_address_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM mailbox_address_migration address
    WHERE lower(address.address) = lower(messages.from_address)
      AND address.target_mailbox_id <> messages.mailbox_id
  );

UPDATE drafts
SET mailbox_id = (
  SELECT address.target_mailbox_id
  FROM mailbox_address_migration address
  WHERE lower(address.address) = lower(drafts.from_address)
  LIMIT 1
)
WHERE from_address <> ''
  AND EXISTS (
    SELECT 1
    FROM mailbox_address_migration address
    WHERE lower(address.address) = lower(drafts.from_address)
      AND address.target_mailbox_id IS NOT drafts.mailbox_id
  );

-- The old Worker remains active until deployment finishes. Freeze the legacy configuration model
-- while still allowing its message and draft writes to finish against the retained address map.
CREATE TRIGGER mailboxes_mail_domain_insert_guard
BEFORE INSERT ON mailboxes
WHEN NEW.mail_domain_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'mailboxes.mail_domain_id is required');
END;

CREATE TRIGGER mailboxes_mail_domain_update_guard
BEFORE UPDATE OF mail_domain_id ON mailboxes
WHEN NEW.mail_domain_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'mailboxes.mail_domain_id is required');
END;

CREATE TRIGGER mailbox_addresses_transition_insert_guard
BEFORE INSERT ON mailbox_addresses
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER mailbox_addresses_transition_update_guard
BEFORE UPDATE ON mailbox_addresses
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER mailbox_addresses_transition_delete_guard
BEFORE DELETE ON mailbox_addresses
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER mailboxes_transition_update_guard
BEFORE UPDATE ON mailboxes
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id = OLD.id OR address.target_mailbox_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER mailboxes_transition_delete_guard
BEFORE DELETE ON mailboxes
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id = OLD.id OR address.target_mailbox_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

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

CREATE TRIGGER retention_policies_transition_insert_guard
BEFORE INSERT ON retention_policies
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id = NEW.mailbox_id OR address.target_mailbox_id = NEW.mailbox_id
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER retention_policies_transition_update_guard
BEFORE UPDATE ON retention_policies
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id IN (OLD.mailbox_id, NEW.mailbox_id)
     OR address.target_mailbox_id IN (OLD.mailbox_id, NEW.mailbox_id)
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

CREATE TRIGGER retention_policies_transition_delete_guard
BEFORE DELETE ON retention_policies
WHEN EXISTS (
  SELECT 1 FROM mailbox_address_migration address
  WHERE address.source_mailbox_id = OLD.mailbox_id
     OR address.target_mailbox_id = OLD.mailbox_id
)
BEGIN
  SELECT RAISE(ABORT, 'mailbox migration is in progress');
END;

PRAGMA foreign_key_check;
PRAGMA optimize;
