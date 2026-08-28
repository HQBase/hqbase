import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

import { users } from "./schema-auth";
import { principals } from "./schema-core";
import { messages } from "./schema-messages";

const nocaseText = customType<{ data: string; driverData: string }>({
  dataType: () => "text COLLATE NOCASE"
});

export const contacts = sqliteTable(
  "contacts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: nocaseText("email").notNull(),
    name: text("name"),
    notes: text("notes").default("").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.email] }),
    check("contacts_email_length_check", sql`length(${table.email}) BETWEEN 3 AND 254`),
    check("contacts_name_length_check", sql`${table.name} IS NULL OR length(${table.name}) <= 200`),
    check("contacts_notes_length_check", sql`length(${table.notes}) <= 10000`),
    index("contacts_user_updated_idx").on(table.userId, sql`${table.updatedAt} DESC`, table.email)
  ]
);

export const labels = sqliteTable(
  "labels",
  {
    id: text("id").primaryKey().notNull(),
    name: nocaseText("name").notNull(),
    color: text("color", {
      enum: ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink"]
    }).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("labels_name_ci_unique").on(table.name),
    check("labels_name_length_check", sql`length(trim(${table.name})) BETWEEN 1 AND 80`),
    check(
      "labels_color_check",
      sql`${table.color} IN ('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink')`
    )
  ]
);

export const messageLabels = sqliteTable(
  "message_labels",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    assignedByPrincipalId: text("assigned_by_principal_id").references(() => principals.id, {
      onDelete: "set null"
    }),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.labelId] }),
    index("message_labels_label_message_idx").on(table.labelId, table.messageId)
  ]
);
