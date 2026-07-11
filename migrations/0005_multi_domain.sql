PRAGMA foreign_keys = ON;

CREATE TABLE workspace_hosts (
  id TEXT PRIMARY KEY NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  zone_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('portal', 'service')),
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
  id TEXT PRIMARY KEY NOT NULL,
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

ALTER TABLE messages ADD COLUMN delivered_to_address_id TEXT REFERENCES mailbox_addresses(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN sent_from_address_id TEXT REFERENCES mailbox_addresses(id) ON DELETE SET NULL;

INSERT INTO mail_domains
  (id, name, receiving_status, sending_status, dns_status, catch_all_policy,
   is_enabled, verified_at, created_at, updated_at)
SELECT 'dom_migrated', lower(json_extract(value_json, '$')), 'ready', 'ready', 'ready', 'reject',
       1, datetime('now'), datetime('now'), datetime('now')
FROM app_settings
WHERE key = 'primary_domain'
  AND json_type(value_json, '$') = 'text'
  AND NOT EXISTS (SELECT 1 FROM mail_domains);

INSERT INTO mailbox_addresses
  (id, mailbox_id, mail_domain_id, local_part, address, display_name,
   receive_enabled, send_enabled, is_primary, created_at, updated_at)
SELECT 'addr_' || m.id, m.id, d.id,
       substr(m.address, 1, instr(m.address, '@') - 1), lower(m.address), m.display_name,
       m.is_active, m.is_active, 1, m.created_at, m.updated_at
FROM mailboxes m
JOIN mail_domains d ON d.name = lower(substr(m.address, instr(m.address, '@') + 1))
WHERE instr(m.address, '@') > 1
  AND NOT EXISTS (SELECT 1 FROM mailbox_addresses a WHERE a.address = lower(m.address));

UPDATE messages
SET delivered_to_address_id = (
  SELECT a.id FROM mailbox_addresses a
  WHERE a.mailbox_id = messages.mailbox_id AND a.address IN (
    SELECT lower(value) FROM json_each(messages.to_json)
  )
  LIMIT 1
)
WHERE direction = 'inbound' AND delivered_to_address_id IS NULL;

UPDATE messages
SET sent_from_address_id = (
  SELECT a.id FROM mailbox_addresses a
  WHERE a.mailbox_id = messages.mailbox_id AND a.address = lower(messages.from_address)
  LIMIT 1
)
WHERE direction = 'outbound' AND sent_from_address_id IS NULL;

INSERT INTO pro_schema_state (key, value, updated_at)
VALUES ('multi_domain', '0005', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
