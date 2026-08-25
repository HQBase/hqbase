import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

import { users } from "./schema-auth";
import * as mailSchema from "./schema-mail";

const nocaseText = customType<{ data: string; driverData: string }>({
  dataType: () => "text COLLATE NOCASE"
});

export const emailSignatures = sqliteTable(
  "email_signatures",
  {
    id: text("id").primaryKey().notNull(),
    name: nocaseText("name").notNull(),
    htmlBody: text("html_body").notNull(),
    textBody: text("text_body").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id").references(() => mailSchema.mailboxes.id, {
      onDelete: "cascade"
    }),
    mailDomainId: text("mail_domain_id").references(() => mailSchema.mailDomains.id, {
      onDelete: "cascade"
    }),
    isDefault: integer("is_default", { mode: "boolean" }).default(false).notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check(
      "email_signatures_scope_check",
      sql`(${table.userId} IS NOT NULL) + (${table.mailboxId} IS NOT NULL) + (${table.mailDomainId} IS NOT NULL) = 1`
    ),
    check("email_signatures_is_default_check", sql`${table.isDefault} IN (0, 1)`),
    uniqueIndex("email_signatures_user_name_uidx")
      .on(table.userId, table.name)
      .where(sql`${table.userId} IS NOT NULL`),
    uniqueIndex("email_signatures_mailbox_name_uidx")
      .on(table.mailboxId, table.name)
      .where(sql`${table.mailboxId} IS NOT NULL`),
    uniqueIndex("email_signatures_domain_name_uidx")
      .on(table.mailDomainId, table.name)
      .where(sql`${table.mailDomainId} IS NOT NULL`),
    uniqueIndex("email_signatures_user_default_uidx")
      .on(table.userId)
      .where(sql`${table.userId} IS NOT NULL AND ${table.isDefault} = 1`),
    uniqueIndex("email_signatures_mailbox_default_uidx")
      .on(table.mailboxId)
      .where(sql`${table.mailboxId} IS NOT NULL AND ${table.isDefault} = 1`),
    uniqueIndex("email_signatures_domain_default_uidx")
      .on(table.mailDomainId)
      .where(sql`${table.mailDomainId} IS NOT NULL AND ${table.isDefault} = 1`),
    index("email_signatures_user_idx").on(table.userId),
    index("email_signatures_mailbox_idx").on(table.mailboxId),
    index("email_signatures_domain_idx").on(table.mailDomainId)
  ]
);
