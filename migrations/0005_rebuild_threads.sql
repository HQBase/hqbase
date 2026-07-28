CREATE TABLE thread_rebuild_map (
  message_id TEXT PRIMARY KEY NOT NULL,
  root_message_id TEXT NOT NULL
);

WITH RECURSIVE parent_links(child_id, parent_id) AS (
  SELECT child.id,
    COALESCE(
      (
        SELECT parent.id
        FROM messages parent
        WHERE child.in_reply_to IS NOT NULL
          AND parent.id <> child.id
          AND parent.mailbox_id IS child.mailbox_id
          AND (parent.message_id = child.in_reply_to OR parent.id = child.in_reply_to)
        ORDER BY
          COALESCE(parent.received_at, parent.sent_at, parent.created_at) DESC
        LIMIT 1
      ),
      (
        SELECT parent.id
        FROM messages parent
        WHERE child.in_reply_to IS NOT NULL
          AND parent.id <> child.id
          AND (parent.message_id = child.in_reply_to OR parent.id = child.in_reply_to)
        ORDER BY
          COALESCE(parent.received_at, parent.sent_at, parent.created_at) DESC
        LIMIT 1
      ),
      (
        SELECT parent.id
        FROM json_each(child.references_json) reference
        JOIN messages parent
          ON parent.message_id = reference.value OR parent.id = reference.value
        WHERE parent.id <> child.id
          AND parent.mailbox_id IS child.mailbox_id
        ORDER BY
          CAST(reference.key AS INTEGER) DESC,
          COALESCE(parent.received_at, parent.sent_at, parent.created_at) DESC
        LIMIT 1
      ),
      (
        SELECT parent.id
        FROM json_each(child.references_json) reference
        JOIN messages parent
          ON parent.message_id = reference.value OR parent.id = reference.value
        WHERE parent.id <> child.id
        ORDER BY
          CAST(reference.key AS INTEGER) DESC,
          COALESCE(parent.received_at, parent.sent_at, parent.created_at) DESC
        LIMIT 1
      )
    )
  FROM messages child
),
walked(message_id, root_message_id, depth) AS (
  SELECT child_id, child_id, 0
  FROM parent_links
  WHERE parent_id IS NULL

  UNION ALL

  SELECT parent_links.child_id, walked.root_message_id, walked.depth + 1
  FROM walked
  JOIN parent_links ON parent_links.parent_id = walked.message_id
  WHERE walked.depth < 100
)
INSERT INTO thread_rebuild_map (message_id, root_message_id)
SELECT message_id, root_message_id
FROM walked;

INSERT OR IGNORE INTO thread_rebuild_map (message_id, root_message_id)
SELECT id, id
FROM messages;

INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
SELECT
  'thr_rebuilt_' || mapping.root_message_id,
  root_thread.subject_normalized,
  MAX(COALESCE(message.received_at, message.sent_at, message.created_at)),
  MIN(message.created_at),
  MAX(message.updated_at)
FROM thread_rebuild_map mapping
JOIN messages message ON message.id = mapping.message_id
JOIN messages root_message ON root_message.id = mapping.root_message_id
JOIN threads root_thread ON root_thread.id = root_message.thread_id
GROUP BY mapping.root_message_id, root_thread.subject_normalized;

UPDATE messages
SET thread_id = 'thr_rebuilt_' || (
  SELECT mapping.root_message_id
  FROM thread_rebuild_map mapping
  WHERE mapping.message_id = messages.id
);

DELETE FROM threads
WHERE NOT EXISTS (
  SELECT 1
  FROM messages
  WHERE messages.thread_id = threads.id
);

DROP TABLE thread_rebuild_map;
