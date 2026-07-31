CREATE TRIGGER IF NOT EXISTS user_login_email_domain_insert_guard
BEFORE INSERT ON "user"
WHEN EXISTS (
  SELECT 1
  FROM mail_domains
  WHERE name = lower(substr(NEW.email, instr(NEW.email, '@') + 1))
)
BEGIN
  SELECT RAISE(ABORT, 'LOGIN_EMAIL_DOMAIN_MANAGED');
END;

CREATE TRIGGER IF NOT EXISTS user_login_email_domain_update_guard
BEFORE UPDATE OF email ON "user"
WHEN lower(NEW.email) <> lower(OLD.email)
  AND EXISTS (
    SELECT 1
    FROM mail_domains
    WHERE name = lower(substr(NEW.email, instr(NEW.email, '@') + 1))
  )
BEGIN
  SELECT RAISE(ABORT, 'LOGIN_EMAIL_DOMAIN_MANAGED');
END;

CREATE TRIGGER IF NOT EXISTS mail_domain_login_email_insert_guard
BEFORE INSERT ON mail_domains
WHEN NOT EXISTS (
    SELECT 1
    FROM mail_domains
    WHERE name = lower(NEW.name)
  )
  AND EXISTS (
    SELECT 1
    FROM "user"
    WHERE lower(email) LIKE '%@' || lower(NEW.name)
  )
BEGIN
  SELECT RAISE(ABORT, 'DOMAIN_USED_BY_LOGIN_EMAIL');
END;

CREATE TRIGGER IF NOT EXISTS mail_domain_login_email_update_guard
BEFORE UPDATE OF name ON mail_domains
WHEN lower(NEW.name) <> lower(OLD.name)
  AND EXISTS (
    SELECT 1
    FROM "user"
    WHERE lower(email) LIKE '%@' || lower(NEW.name)
  )
BEGIN
  SELECT RAISE(ABORT, 'DOMAIN_USED_BY_LOGIN_EMAIL');
END;
