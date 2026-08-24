-- Finish the one-address-per-mailbox cutover after the new Worker is active.

PRAGMA defer_foreign_keys = ON;

-- Phase one froze the legacy address and mailbox configuration. Remove those temporary guards now;
-- this migration transaction keeps concurrent writes serialized until the old objects are gone.
DROP TRIGGER IF EXISTS mailbox_addresses_transition_insert_guard;
DROP TRIGGER IF EXISTS mailbox_addresses_transition_update_guard;
DROP TRIGGER IF EXISTS mailbox_addresses_transition_delete_guard;
DROP TRIGGER IF EXISTS mailboxes_transition_update_guard;
DROP TRIGGER IF EXISTS mailboxes_transition_delete_guard;
DROP TRIGGER IF EXISTS mailbox_grants_transition_insert_guard;
DROP TRIGGER IF EXISTS mailbox_grants_transition_update_guard;
DROP TRIGGER IF EXISTS mailbox_grants_transition_delete_guard;
DROP TRIGGER IF EXISTS retention_policies_transition_insert_guard;
DROP TRIGGER IF EXISTS retention_policies_transition_update_guard;
DROP TRIGGER IF EXISTS retention_policies_transition_delete_guard;

UPDATE messages
SET delivered_to_address = (
  SELECT address.address
  FROM mailbox_address_migration address
  WHERE address.address_id = messages.delivered_to_address_id
)
WHERE delivered_to_address_id IS NOT NULL
  AND delivered_to_address IS NOT (
    SELECT address.address
    FROM mailbox_address_migration address
    WHERE address.address_id = messages.delivered_to_address_id
  );

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

ALTER TABLE messages DROP COLUMN delivered_to_address_id;
ALTER TABLE messages DROP COLUMN sent_from_address_id;

DROP TABLE mailbox_addresses;
DROP TABLE mailbox_address_migration;

UPDATE release_state
SET installed_schema_version = 3,
    updated_at = datetime('now')
WHERE singleton = 1;

PRAGMA foreign_key_check;
PRAGMA optimize;
