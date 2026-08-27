import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  customType,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

import { users } from "./schema-auth";
import { principals } from "./schema-core";

const nocaseText = customType<{ data: string; driverData: string }>({
  dataType: () => "text COLLATE NOCASE"
});

export const mailboxes = sqliteTable(
  "mailboxes",
  {
    id: text("id").primaryKey().notNull(),
    address: text("address").notNull().unique(),
    mailDomainId: text("mail_domain_id")
      .notNull()
      .references((): AnySQLiteColumn => mailDomains.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    kind: text("kind", { enum: ["human", "agent"] })
      .default("human")
      .notNull(),
    deletedAt: text("deleted_at"),
    isActive: integer("is_active", { mode: "boolean" }).default(sql`1`).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("mailboxes_address_ci_unique").on(sql`lower(${table.address})`),
    check("mailboxes_kind_check", sql`${table.kind} IN ('human', 'agent')`)
  ]
);

export const mailboxGrants = sqliteTable(
  "mailbox_grants",
  {
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    accessLevel: text("access_level", { enum: ["read", "agent", "manager"] }).notNull(),
    createdByPrincipalId: text("created_by_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.mailboxId, table.principalId] }),
    check(
      "mailbox_grants_access_level_check",
      sql`${table.accessLevel} IN ('read', 'agent', 'manager')`
    ),
    index("mailbox_grants_principal_idx").on(table.principalId, table.accessLevel, table.mailboxId)
  ]
);

export const retentionPolicies = sqliteTable(
  "retention_policies",
  {
    mailboxId: text("mailbox_id")
      .primaryKey()
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    messageDays: integer("message_days"),
    trashDays: integer("trash_days").default(30).notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check(
      "retention_policies_message_days_check",
      sql`${table.messageDays} IS NULL OR ${table.messageDays} >= 1`
    ),
    check("retention_policies_trash_days_check", sql`${table.trashDays} >= 1`)
  ]
);

export const mailDomains = sqliteTable(
  "mail_domains",
  {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull().unique(),
    zoneId: text("zone_id"),
    accountId: text("account_id"),
    receivingStatus: text("receiving_status", {
      enum: ["pending", "ready", "degraded", "disabled"]
    })
      .default("pending")
      .notNull(),
    sendingStatus: text("sending_status", {
      enum: ["pending", "ready", "degraded", "disabled"]
    })
      .default("pending")
      .notNull(),
    dnsStatus: text("dns_status", { enum: ["pending", "ready", "degraded"] })
      .default("pending")
      .notNull(),
    catchAllPolicy: text("catch_all_policy", { enum: ["reject", "mailbox", "unassigned"] })
      .default("reject")
      .notNull(),
    catchAllMailboxId: text("catch_all_mailbox_id").references(
      (): AnySQLiteColumn => mailboxes.id,
      {
        onDelete: "set null"
      }
    ),
    isEnabled: integer("is_enabled", { mode: "boolean" }).default(sql`1`).notNull(),
    lastErrorCode: text("last_error_code"),
    disconnectedAt: text("disconnected_at"),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check(
      "mail_domains_receiving_status_check",
      sql`${table.receivingStatus} IN ('pending', 'ready', 'degraded', 'disabled')`
    ),
    check(
      "mail_domains_sending_status_check",
      sql`${table.sendingStatus} IN ('pending', 'ready', 'degraded', 'disabled')`
    ),
    check(
      "mail_domains_dns_status_check",
      sql`${table.dnsStatus} IN ('pending', 'ready', 'degraded')`
    ),
    check(
      "mail_domains_catch_all_policy_check",
      sql`${table.catchAllPolicy} IN ('reject', 'mailbox', 'unassigned')`
    ),
    check("mail_domains_is_enabled_check", sql`${table.isEnabled} IN (0, 1)`)
  ]
);

export const domainSetupOperations = sqliteTable(
  "domain_setup_operations",
  {
    id: text("id").primaryKey(),
    mailDomainId: text("mail_domain_id").references(() => mailDomains.id, {
      onDelete: "cascade"
    }),
    kind: text("kind", {
      enum: ["provision", "verify", "disable", "remove", "portal-cutover"]
    }).notNull(),
    status: text("status", {
      enum: ["pending", "running", "succeeded", "failed"]
    }).notNull(),
    steps: text("steps_json", { mode: "json" }).$type<unknown[]>().default(sql`'[]'`).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    errorCode: text("error_code"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check(
      "domain_setup_operations_kind_check",
      sql`${table.kind} IN ('provision', 'verify', 'disable', 'remove', 'portal-cutover')`
    ),
    check(
      "domain_setup_operations_status_check",
      sql`${table.status} IN ('pending', 'running', 'succeeded', 'failed')`
    )
  ]
);

export const userOnboarding = sqliteTable(
  "user_onboarding",
  {
    userId: text("user_id")
      .primaryKey()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: text("method", { enum: ["email_invite", "temporary_password"] }).notNull(),
    status: text("status", { enum: ["pending", "complete"] })
      .default("pending")
      .notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    invitationSentAt: text("invitation_sent_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check(
      "user_onboarding_method_check",
      sql`${table.method} IN ('email_invite', 'temporary_password')`
    ),
    check("user_onboarding_status_check", sql`${table.status} IN ('pending', 'complete')`),
    index("user_onboarding_status_idx").on(table.status, table.method, table.createdAt)
  ]
);

export const userMailPreferences = sqliteTable(
  "user_mail_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultFromMailboxId: text("default_from_mailbox_id").references(() => mailboxes.id, {
      onDelete: "set null"
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("user_mail_preferences_default_from_idx").on(table.defaultFromMailboxId)]
);

export const messageSenderPreferences = sqliteTable(
  "message_sender_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderAddress: nocaseText("sender_address").notNull(),
    loadRemoteMedia: integer("load_remote_media", { mode: "boolean" }).default(sql`0`).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.senderAddress] }),
    check(
      "message_sender_preferences_load_remote_media_check",
      sql`${table.loadRemoteMedia} IN (0, 1)`
    )
  ]
);
