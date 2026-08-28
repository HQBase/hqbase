ALTER TABLE draft_attachments ADD COLUMN content_id TEXT;

CREATE UNIQUE INDEX draft_attachments_content_id_uidx
ON draft_attachments(content_id)
WHERE content_id IS NOT NULL;
