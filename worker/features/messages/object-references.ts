import { sql } from "drizzle-orm";
import { getRows } from "../../db/drizzle";

/** One bound set and one D1 query for a whole R2 page, including unfinished sends. */
export async function referencedObjectKeys(
  db: D1Database,
  keys: readonly string[]
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await getRows<{ key: string }>(
    db,
    sql`
    WITH candidates AS (SELECT value AS key FROM json_each(${JSON.stringify(keys)}))
    SELECT key FROM candidates WHERE
      EXISTS (SELECT 1 FROM messages WHERE raw_r2_key = candidates.key) OR
      EXISTS (SELECT 1 FROM messages WHERE html_r2_key = candidates.key) OR
      EXISTS (SELECT 1 FROM messages WHERE text_r2_key = candidates.key) OR
      EXISTS (SELECT 1 FROM message_attachments WHERE r2_key = candidates.key) OR
      EXISTS (SELECT 1 FROM draft_attachments WHERE r2_key = candidates.key) OR
      EXISTS (SELECT 1 FROM send_operations operation, json_each(operation.object_keys_json) object
        WHERE operation.status <> 'stored' AND object.value = candidates.key)`
  );
  return new Set(rows.map((row) => row.key));
}
