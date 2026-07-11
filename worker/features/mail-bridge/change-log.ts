import { nowIso } from "../../db/client";

export async function recordMessageChange(db: D1Database, messageId: string): Promise<number> {
  const row = await db
    .prepare("INSERT INTO pro_message_changes (message_id, created_at) VALUES (?, ?) RETURNING seq")
    .bind(messageId, nowIso())
    .first<{ seq: number }>();
  if (!row) throw new Error("Failed to create mail change record");
  return row.seq;
}
