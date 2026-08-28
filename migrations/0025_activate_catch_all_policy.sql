-- Preserve the effective pre-policy behavior before inbound delivery starts reading these fields.
UPDATE mail_domains
SET catch_all_policy = 'unassigned',
    catch_all_mailbox_id = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE catch_all_policy <> 'unassigned'
   OR catch_all_mailbox_id IS NOT NULL;
