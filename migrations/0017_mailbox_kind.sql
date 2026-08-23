-- Keep dedicated agent mailboxes distinct from ordinary mailboxes in every client.

ALTER TABLE mailboxes
ADD COLUMN kind TEXT NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'agent'));

-- Agent mailbox creation writes the mailbox, agent, and grant with one timestamp. Existing
-- mailboxes that were later shared with an agent keep the human kind.
UPDATE mailboxes
SET kind = 'agent'
WHERE EXISTS (
  SELECT 1
  FROM mailbox_grants grant_row
  JOIN agents agent ON agent.principal_id = grant_row.principal_id
  WHERE grant_row.mailbox_id = mailboxes.id
    AND agent.profile = 'mailbox'
    AND agent.created_at = mailboxes.created_at
    AND grant_row.created_at = mailboxes.created_at
);
