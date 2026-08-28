CREATE TABLE email_signatures (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE CASCADE,
  mail_domain_id TEXT REFERENCES mail_domains(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (user_id IS NOT NULL) +
    (mailbox_id IS NOT NULL) +
    (mail_domain_id IS NOT NULL) = 1
  )
);

CREATE UNIQUE INDEX email_signatures_user_name_uidx
ON email_signatures(user_id, name)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX email_signatures_mailbox_name_uidx
ON email_signatures(mailbox_id, name)
WHERE mailbox_id IS NOT NULL;

CREATE UNIQUE INDEX email_signatures_domain_name_uidx
ON email_signatures(mail_domain_id, name)
WHERE mail_domain_id IS NOT NULL;

CREATE UNIQUE INDEX email_signatures_user_default_uidx
ON email_signatures(user_id)
WHERE user_id IS NOT NULL AND is_default = 1;

CREATE UNIQUE INDEX email_signatures_mailbox_default_uidx
ON email_signatures(mailbox_id)
WHERE mailbox_id IS NOT NULL AND is_default = 1;

CREATE UNIQUE INDEX email_signatures_domain_default_uidx
ON email_signatures(mail_domain_id)
WHERE mail_domain_id IS NOT NULL AND is_default = 1;

CREATE INDEX email_signatures_user_idx ON email_signatures(user_id);
CREATE INDEX email_signatures_mailbox_idx ON email_signatures(mailbox_id);
CREATE INDEX email_signatures_domain_idx ON email_signatures(mail_domain_id);

ALTER TABLE drafts ADD COLUMN signature_mode TEXT NOT NULL DEFAULT 'none'
CHECK (signature_mode IN ('automatic', 'selected', 'none'));

ALTER TABLE drafts ADD COLUMN signature_id TEXT
REFERENCES email_signatures(id) ON DELETE SET NULL;

ALTER TABLE drafts ADD COLUMN signature_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN signature_html_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN signature_text_snapshot TEXT NOT NULL DEFAULT '';
