import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey().notNull(),
  value: text("value_json", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const hqbaseSchemaState = sqliteTable("hqbase_schema_state", {
  key: text("key").primaryKey().notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const principals = sqliteTable(
  "principals",
  {
    id: text("id").primaryKey().notNull(),
    type: text("type", { enum: ["user", "agent"] }).notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .default("active")
      .notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check("principals_type_check", sql`${table.type} IN ('user', 'agent')`),
    check("principals_status_check", sql`${table.status} IN ('active', 'disabled')`)
  ]
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey().notNull(),
    occurredAt: text("occurred_at").notNull(),
    correlationId: text("correlation_id").notNull(),
    actorType: text("actor_type", {
      enum: ["user", "agent", "system", "operator"]
    }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: text("outcome", { enum: ["success", "denied", "failure"] }).notNull(),
    metadata: text("metadata_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .default(sql`'{}'`)
      .notNull()
  },
  (table) => [
    check(
      "audit_events_actor_type_check",
      sql`${table.actorType} IN ('user', 'agent', 'system', 'operator')`
    ),
    check("audit_events_outcome_check", sql`${table.outcome} IN ('success', 'denied', 'failure')`),
    index("audit_events_time_idx").on(sql`${table.occurredAt} DESC`),
    index("audit_events_resource_idx").on(
      table.resourceType,
      table.resourceId,
      sql`${table.occurredAt} DESC`
    )
  ]
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    requestCount: integer("request_count").notNull(),
    expiresAt: integer("expires_at").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.subjectHash, table.windowStart] }),
    index("rate_limits_expiry_idx").on(table.expiresAt)
  ]
);

export const operationRuns = sqliteTable(
  "operation_runs",
  {
    id: text("id").primaryKey().notNull(),
    kind: text("kind").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    cursor: text("cursor"),
    counters: text("counters_json", { mode: "json" })
      .$type<Record<string, number>>()
      .default(sql`'{}'`)
      .notNull(),
    errorCode: text("error_code"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at")
  },
  (table) => [
    check(
      "operation_runs_status_check",
      sql`${table.status} IN ('running', 'succeeded', 'failed')`
    ),
    index("operation_runs_kind_idx").on(table.kind, sql`${table.startedAt} DESC`)
  ]
);

export const deploymentState = sqliteTable("deployment_state", {
  key: text("key").primaryKey().notNull(),
  value: text("value_json", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull()
});

export const workspaceHosts = sqliteTable(
  "workspace_hosts",
  {
    id: text("id").primaryKey().notNull(),
    hostname: text("hostname").notNull().unique(),
    zoneId: text("zone_id"),
    kind: text("kind", { enum: ["portal"] }).notNull(),
    isCanonical: integer("is_canonical", { mode: "boolean" }).default(sql`0`).notNull(),
    status: text("status", { enum: ["pending", "ready", "degraded", "disabled"] })
      .default("ready")
      .notNull(),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check("workspace_hosts_kind_check", sql`${table.kind} = 'portal'`),
    check("workspace_hosts_is_canonical_check", sql`${table.isCanonical} IN (0, 1)`),
    check(
      "workspace_hosts_status_check",
      sql`${table.status} IN ('pending', 'ready', 'degraded', 'disabled')`
    ),
    uniqueIndex("workspace_hosts_canonical_portal_idx")
      .on(table.kind)
      .where(sql`${table.kind} = 'portal' AND ${table.isCanonical} = 1`)
  ]
);

export const installationIdentity = sqliteTable(
  "installation_identity",
  {
    singleton: integer("singleton").primaryKey(),
    installationId: text("installation_id").notNull().unique(),
    workerName: text("worker_name").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [check("installation_identity_singleton_check", sql`${table.singleton} = 1`)]
);

export const releaseState = sqliteTable(
  "release_state",
  {
    singleton: integer("singleton").primaryKey(),
    product: text("product", { enum: ["hqbase"] }).notNull(),
    installedVersion: text("installed_version").notNull(),
    installedSchemaVersion: integer("installed_schema_version").notNull(),
    channel: text("channel", { enum: ["stable"] }).notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    check("release_state_singleton_check", sql`${table.singleton} = 1`),
    check("release_state_product_check", sql`${table.product} = 'hqbase'`),
    check("release_state_channel_check", sql`${table.channel} = 'stable'`)
  ]
);

export const updateHistory = sqliteTable(
  "update_history",
  {
    id: text("id").primaryKey(),
    fromVersion: text("from_version").notNull(),
    toVersion: text("to_version").notNull(),
    checkpointBookmark: text("checkpoint_bookmark").notNull(),
    workerVersion: text("worker_version").notNull(),
    state: text("state", { enum: ["started", "deployed", "verified", "failed"] }).notNull(),
    errorCode: text("error_code"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at")
  },
  (table) => [
    check(
      "update_history_state_check",
      sql`${table.state} IN ('started', 'deployed', 'verified', 'failed')`
    )
  ]
);
