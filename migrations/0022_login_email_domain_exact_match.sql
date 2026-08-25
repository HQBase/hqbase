DROP TRIGGER IF EXISTS mail_domain_login_email_insert_guard;
DROP TRIGGER IF EXISTS mail_domain_login_email_update_guard;

CREATE TRIGGER mail_domain_login_email_insert_guard
BEFORE INSERT ON mail_domains
WHEN NOT EXISTS (
    SELECT 1
    FROM mail_domains
    WHERE name = lower(NEW.name)
  )
  AND EXISTS (
    SELECT 1
    FROM "user"
    WHERE lower(substr(email, instr(email, '@') + 1)) = lower(NEW.name)
  )
BEGIN
  SELECT RAISE(ABORT, 'DOMAIN_USED_BY_LOGIN_EMAIL');
END;

CREATE TRIGGER mail_domain_login_email_update_guard
BEFORE UPDATE OF name ON mail_domains
WHEN lower(NEW.name) <> lower(OLD.name)
  AND EXISTS (
    SELECT 1
    FROM "user"
    WHERE lower(substr(email, instr(email, '@') + 1)) = lower(NEW.name)
  )
BEGIN
  SELECT RAISE(ABORT, 'DOMAIN_USED_BY_LOGIN_EMAIL');
END;
