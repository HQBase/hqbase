-- Keyset pagination for GET /api/v1/messages orders by
-- COALESCE(received_at, sent_at, created_at) DESC, id DESC.
-- The existing created_at indexes do not match that order, so SQLite built a temporary B-tree for
-- every page. These expression indexes supply the order directly for each filter combination.

CREATE INDEX IF NOT EXISTS messages_activity_idx
ON messages(COALESCE(received_at, sent_at, created_at) DESC, id DESC);

CREATE INDEX IF NOT EXISTS messages_mailbox_activity_idx
ON messages(mailbox_id, COALESCE(received_at, sent_at, created_at) DESC, id DESC);

CREATE INDEX IF NOT EXISTS messages_folder_activity_idx
ON messages(folder, COALESCE(received_at, sent_at, created_at) DESC, id DESC);

-- The planner only prefers the new ordering indexes over the older (mailbox_id, created_at)
-- ones once it has statistics for them: without this, the default broad-access shape
-- (mailbox_id IN (...) with no folder filter) still sorts in a temporary B-tree. Cloudflare's
-- guidance for D1 is to run PRAGMA optimize after creating indexes.
PRAGMA optimize;
