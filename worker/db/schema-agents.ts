import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { principals } from "./schema-core";
import { mailDomains } from "./schema-mail";

export const agents = sqliteTable(
  "agents",
  {
    principalId: text("principal_id")
      .primaryKey()
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    profile: text("profile", { enum: ["mailbox", "provisioner"] }).notNull(),
    createdByPrincipalId: text("created_by_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    mailDomainId: text("mail_domain_id")
      .notNull()
      .references(() => mailDomains.id, { onDelete: "restrict" }),
    mailboxLimit: integer("mailbox_limit"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check("agents_profile_check", sql`${table.profile} IN ('mailbox', 'provisioner')`),
    check(
      "agents_profile_fields_check",
      sql`(${table.profile} = 'mailbox' AND ${table.mailboxLimit} IS NULL)
          OR (${table.profile} = 'provisioner' AND ${table.mailboxLimit} >= 1)`
    ),
    index("agents_creator_idx").on(table.createdByPrincipalId, table.profile, table.createdAt),
    index("agents_domain_idx").on(table.mailDomainId, table.profile, table.createdAt)
  ]
);

export const agentCredentials = sqliteTable(
  "agent_credentials",
  {
    id: text("id").primaryKey().notNull(),
    principalId: text("principal_id")
      .notNull()
      .references(() => agents.principalId, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull().unique(),
    resource: text("resource", { enum: ["mail", "management"] }).notNull(),
    scopes: text("scopes_json", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    lastUsedAt: text("last_used_at")
  },
  (table) => [
    check("agent_credentials_resource_check", sql`${table.resource} IN ('mail', 'management')`),
    check(
      "agent_credentials_scopes_json_check",
      sql`json_valid(${table.scopes}) AND json_type(${table.scopes}) = 'array'`
    ),
    uniqueIndex("agent_credentials_current_resource_idx")
      .on(table.principalId, table.resource)
      .where(sql`${table.revokedAt} IS NULL`),
    index("agent_credentials_principal_idx").on(table.principalId, sql`${table.createdAt} DESC`)
  ]
);
