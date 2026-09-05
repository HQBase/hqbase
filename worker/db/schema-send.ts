import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sendOperations = sqliteTable(
  "send_operations",
  {
    id: text("id").primaryKey().notNull(),
    principalId: text("principal_id"),
    draftId: text("draft_id"),
    mailboxId: text("mailbox_id"),
    requestHash: text("request_hash").notNull(),
    status: text("status", { enum: ["sending", "accepted", "stored", "unknown"] }).notNull(),
    messageId: text("message_id").notNull(),
    providerMessageId: text("provider_message_id"),
    payloadR2Key: text("payload_r2_key").notNull().unique(),
    receiptR2Key: text("receipt_r2_key").notNull().unique(),
    objectKeys: text("object_keys_json", { mode: "json" })
      .$type<string[]>()
      .default(sql`'[]'`)
      .notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check(
      "send_operations_status_check",
      sql`${table.status} IN ('sending', 'accepted', 'stored', 'unknown')`
    ),
    uniqueIndex("send_operations_draft_idx")
      .on(table.principalId, table.draftId)
      .where(sql`${table.draftId} IS NOT NULL`),
    index("send_operations_status_idx").on(table.status, table.updatedAt)
  ]
);
