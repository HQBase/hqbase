ALTER TABLE message_attachments
ADD COLUMN disposition TEXT NOT NULL DEFAULT 'attachment'
CHECK (disposition IN ('attachment', 'inline'));

UPDATE message_attachments
SET disposition = 'inline'
WHERE lower(content_id) LIKE '%@hqbase.invalid%';
