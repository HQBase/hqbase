DELETE FROM verification
WHERE identifier LIKE 'reset-password:%'
  AND EXISTS (
    SELECT 1
    FROM verification AS newer
    WHERE newer.value = verification.value
      AND newer.identifier LIKE 'reset-password:%'
      AND (
        newer.createdAt > verification.createdAt
        OR (newer.createdAt = verification.createdAt AND newer.id > verification.id)
      )
  );

CREATE TRIGGER IF NOT EXISTS verification_latest_password_reset_token
BEFORE INSERT ON verification
WHEN NEW.identifier LIKE 'reset-password:%'
BEGIN
  DELETE FROM verification
  WHERE value = NEW.value
    AND identifier LIKE 'reset-password:%';
END;
