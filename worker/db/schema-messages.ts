import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { principals } from "./schema-core";
import { mailboxes } from "./schema-mail";
import { emailSignatures } from "./schema-signatures";

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey().notNull(),
    subjectNormalized: text("subject_normalized").notNull(),
    lastMessageAt: text("last_message_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("threads_last_message_at_idx").on(table.lastMessageAt)]
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey().notNull(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    folder: text("folder", {
      enum: ["inbox", "sent", "drafts", "archived", "trash", "catchall"]
    }).notNull(),
    fromAddress: text("from_address").notNull(),
    to: text("to_json", { mode: "json" }).$type<string[]>().notNull(),
    cc: text("cc_json", { mode: "json" }).$type<string[]>().notNull(),
    bcc: text("bcc_json", { mode: "json" }).$type<string[]>().notNull(),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull(),
    textBody: text("text_body").notNull(),
    htmlR2Key: text("html_r2_key"),
    rawR2Key: text("raw_r2_key"),
    messageId: text("message_id"),
    dedupeKey: text("dedupe_key").unique(),
    inReplyTo: text("in_reply_to"),
    references: text("references_json", { mode: "json" }).$type<string[]>().notNull(),
    receivedAt: text("received_at"),
    sentAt: text("sent_at"),
    readAt: text("read_at"),
    starredAt: text("starred_at"),
    archivedAt: text("archived_at"),
    trashedAt: text("trashed_at"),
    hasAttachments: integer("has_attachments", { mode: "boolean" }).default(sql`0`).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deliveredToAddress: text("delivered_to_address"),
    isUnassigned: integer("is_unassigned", { mode: "boolean" }).default(sql`0`).notNull()
  },
  (table) => [
    check("messages_direction_check", sql`${table.direction} IN ('inbound', 'outbound')`),
    check(
      "messages_folder_check",
      sql`${table.folder} IN ('inbox', 'sent', 'drafts', 'archived', 'trash', 'catchall')`
    ),
    check(
      "messages_is_unassigned_check",
      sql`${table.isUnassigned} IN (0, 1) AND (${table.isUnassigned} = 0 OR (${table.mailboxId} IS NULL AND ${table.direction} = 'inbound'))`
    ),
    index("messages_folder_idx").on(table.folder, table.createdAt),
    index("messages_mailbox_idx").on(table.mailboxId, table.createdAt),
    index("messages_message_id_idx").on(table.messageId),
    index("messages_dedupe_key_idx").on(table.dedupeKey),
    index("messages_thread_idx").on(table.threadId, table.createdAt)
  ]
);

export const messageAttachments = sqliteTable(
  "message_attachments",
  {
    id: text("id").primaryKey().notNull(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentId: text("content_id"),
    r2Key: text("r2_key").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("message_attachments_message_idx").on(table.messageId)]
);

export const messageChanges = sqliteTable(
  "message_changes",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    messageId: text("message_id").notNull(),
    mailboxId: text("mailbox_id"),
    kind: text("kind", { enum: ["upsert", "delete"] }).notNull(),
    changedAt: text("changed_at").notNull(),
    isUnassigned: integer("is_unassigned", { mode: "boolean" }).default(sql`0`).notNull()
  },
  (table) => [
    check("message_changes_kind_check", sql`${table.kind} IN ('upsert', 'delete')`),
    check("message_changes_is_unassigned_check", sql`${table.isUnassigned} IN (0, 1)`)
  ]
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey().notNull(),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
    replyToMessageId: text("reply_to_message_id").references(() => messages.id, {
      onDelete: "set null"
    }),
    fromAddress: text("from_address").default("").notNull(),
    to: text("to_json", { mode: "json" }).$type<string[]>().default(sql`'[]'`).notNull(),
    cc: text("cc_json", { mode: "json" }).$type<string[]>().default(sql`'[]'`).notNull(),
    bcc: text("bcc_json", { mode: "json" }).$type<string[]>().default(sql`'[]'`).notNull(),
    subject: text("subject").default("").notNull(),
    textBody: text("text_body").default("").notNull(),
    htmlBody: text("html_body").default("").notNull(),
    signatureMode: text("signature_mode", { enum: ["automatic", "selected", "none"] })
      .default("none")
      .notNull(),
    signatureId: text("signature_id").references(() => emailSignatures.id, {
      onDelete: "set null"
    }),
    signatureNameSnapshot: text("signature_name_snapshot").default("").notNull(),
    signatureHtmlSnapshot: text("signature_html_snapshot").default("").notNull(),
    signatureTextSnapshot: text("signature_text_snapshot").default("").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    forwardOfMessageId: text("forward_of_message_id").references(() => messages.id, {
      onDelete: "set null"
    })
  },
  (table) => [
    check(
      "drafts_signature_mode_check",
      sql`${table.signatureMode} IN ('automatic', 'selected', 'none')`
    ),
    index("drafts_principal_updated_id_idx").on(
      table.principalId,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`
    ),
    index("drafts_forward_message_idx").on(table.forwardOfMessageId)
  ]
);

export const draftAttachments = sqliteTable(
  "draft_attachments",
  {
    id: text("id").primaryKey().notNull(),
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    r2Key: text("r2_key").notNull().unique(),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("draft_attachments_draft_idx").on(table.draftId, table.createdAt)]
);

export const draftChanges = sqliteTable(
  "draft_changes",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    draftId: text("draft_id").notNull(),
    principalId: text("principal_id").notNull(),
    kind: text("kind", { enum: ["upsert", "delete"] }).notNull(),
    changedAt: text("changed_at").notNull()
  },
  (table) => [
    check("draft_changes_kind_check", sql`${table.kind} IN ('upsert', 'delete')`),
    index("draft_changes_principal_sequence_idx").on(table.principalId, table.sequence)
  ]
);
