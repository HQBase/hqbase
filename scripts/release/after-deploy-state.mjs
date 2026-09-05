import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { attemptRun, emitCommandOutput } from "./command.mjs";

export const pendingSendGuards = [
  "send_operations_require_draft",
  "drafts_before_update_pending_send",
  "drafts_before_delete_pending_send",
  "draft_attachments_before_update_pending_send",
  "draft_attachments_before_delete_pending_send",
  "draft_attachments_before_insert_pending_send",
  "draft_labels_before_update_pending_send",
  "draft_labels_before_delete_pending_send",
  "draft_labels_before_insert_pending_send"
];

const afterDeployMigrations = [
  "0001_remove_mailbox_alias_storage.sql",
  "0002_finalize_agent_principals.sql",
  "0003_finalize_draft_labels.sql",
  "0004_mail_reliability_guards.sql"
];

export const finalAfterDeployPhase = `S${afterDeployMigrations.length}`;

const addressTransitionTables = ["mailbox_addresses", "mailbox_address_migration"];
const addressTransitionColumns = [
  "messages.delivered_to_address_id",
  "messages.sent_from_address_id"
];
const addressTransitionTriggers = [
  "mailbox_addresses_transition_insert_guard",
  "mailbox_addresses_transition_update_guard",
  "mailbox_addresses_transition_delete_guard",
  "mailboxes_transition_update_guard",
  "mailboxes_transition_delete_guard",
  "mailbox_grants_transition_insert_guard",
  "mailbox_grants_transition_update_guard",
  "mailbox_grants_transition_delete_guard",
  "retention_policies_transition_insert_guard",
  "retention_policies_transition_update_guard",
  "retention_policies_transition_delete_guard"
];
const principalTransitionColumns = [
  "mailbox_grants.user_id",
  "mailbox_grants.created_by",
  "drafts.user_id",
  "draft_changes.user_id"
];
const principalTransitionTriggers = [
  "mailbox_grants_identity_insert_guard",
  "mailbox_grants_after_insert_sync",
  "mailbox_grants_after_legacy_identity_update",
  "mailbox_grants_after_principal_identity_update",
  "drafts_identity_insert_guard",
  "drafts_after_insert_sync_ownership",
  "drafts_after_legacy_owner_update",
  "drafts_after_principal_owner_update"
];
const requiredTables = ["messages", "mailbox_grants", "drafts", "draft_changes", "draft_labels"];
const requiredColumns = [
  "messages.mailbox_id",
  "messages.delivered_to_address",
  "mailbox_grants.mailbox_id",
  "mailbox_grants.principal_id",
  "mailbox_grants.created_by_principal_id",
  "drafts.id",
  "drafts.principal_id",
  "draft_changes.sequence",
  "draft_changes.draft_id",
  "draft_changes.principal_id",
  "draft_labels.draft_id",
  "draft_labels.label_id",
  "draft_labels.assigned_by_principal_id"
];
const requiredTriggers = [
  "mailboxes_mail_domain_insert_guard",
  "mailboxes_mail_domain_update_guard",
  "principals_after_user_insert",
  "principals_after_user_update",
  "principals_after_user_delete",
  "agents_before_agent_created_child",
  "mailboxes_after_soft_delete_agent_access",
  "mailbox_grants_before_agent_insert_on_deleted_mailbox",
  "mailbox_grants_before_agent_update_on_deleted_mailbox",
  "principals_before_agent_reenable_with_deleted_mailbox",
  "agent_credentials_before_active_insert_with_deleted_mailbox",
  "agent_credentials_before_unrevoke_with_deleted_mailbox",
  "draft_changes_after_insert",
  "draft_changes_after_update",
  "draft_changes_after_delete",
  "draft_changes_after_attachment_insert",
  "draft_changes_after_attachment_delete",
  "draft_changes_after_label_insert",
  "draft_changes_after_label_delete"
];
const requiredForeignKeys = [
  "mailbox_grants.mailbox_id->mailboxes.id:CASCADE",
  "mailbox_grants.principal_id->principals.id:CASCADE",
  "mailbox_grants.created_by_principal_id->principals.id:RESTRICT",
  "drafts.principal_id->principals.id:CASCADE"
];
const principalTransitionForeignKeys = [
  "mailbox_grants.user_id->user.id:CASCADE",
  "mailbox_grants.created_by->user.id:RESTRICT",
  "drafts.user_id->user.id:CASCADE"
];
const draftLabelsForeignKey = "draft_labels.draft_id->drafts.id:CASCADE";

const inspectedTables = [
  ...requiredTables,
  ...addressTransitionTables,
  "d1_migrations_after_deploy"
];
const inspectedTriggers = [
  ...pendingSendGuards,
  ...requiredTriggers,
  ...addressTransitionTriggers,
  ...principalTransitionTriggers
];

// Remote D1 rejects a compound SELECT with more than five terms. One Wrangler command keeps both
// statements in the same D1 batch while parseD1Rows combines their result sets.
export const afterDeploySchemaSqlStatements = [
  `
  SELECT 'table:' || name AS item
  FROM sqlite_master
  WHERE type = 'table' AND name IN (${sqlList(inspectedTables)})
  UNION ALL
  SELECT 'trigger:' || name AS item
  FROM sqlite_master
  WHERE type = 'trigger' AND name IN (${sqlList(inspectedTriggers)})
  UNION ALL
  SELECT 'column:messages.' || name AS item
  FROM pragma_table_info('messages')
  WHERE name IN ('mailbox_id', 'delivered_to_address', 'delivered_to_address_id', 'sent_from_address_id')
  UNION ALL
  SELECT 'column:mailbox_grants.' || name AS item
  FROM pragma_table_info('mailbox_grants')
  WHERE name IN ('mailbox_id', 'user_id', 'principal_id', 'created_by', 'created_by_principal_id')
  UNION ALL
  SELECT 'column:drafts.' || name AS item
  FROM pragma_table_info('drafts')
  WHERE name IN ('id', 'user_id', 'principal_id')
  ORDER BY item
  `.trim(),
  `
  SELECT 'column:draft_changes.' || name AS item
  FROM pragma_table_info('draft_changes')
  WHERE name IN ('sequence', 'draft_id', 'user_id', 'principal_id')
  UNION ALL
  SELECT 'column:draft_labels.' || name AS item
  FROM pragma_table_info('draft_labels')
  WHERE name IN ('draft_id', 'label_id', 'assigned_by_principal_id')
  UNION ALL
  SELECT 'foreign-key:mailbox_grants.' || "from" || '->' || "table" || '.' || "to" || ':' || "on_delete" AS item
  FROM pragma_foreign_key_list('mailbox_grants')
  WHERE "from" IN ('mailbox_id', 'user_id', 'principal_id', 'created_by', 'created_by_principal_id')
  UNION ALL
  SELECT 'foreign-key:drafts.' || "from" || '->' || "table" || '.' || "to" || ':' || "on_delete" AS item
  FROM pragma_foreign_key_list('drafts')
  WHERE "from" IN ('user_id', 'principal_id')
  UNION ALL
  SELECT 'foreign-key:draft_labels.' || "from" || '->' || "table" || '.' || "to" || ':' || "on_delete" AS item
  FROM pragma_foreign_key_list('draft_labels')
  WHERE "from" = 'draft_id'
  ORDER BY item
  `.trim()
];

export const afterDeploySchemaSql = afterDeploySchemaSqlStatements.join(";\n");

export function inspectRemoteAfterDeployState(source, version, options = {}) {
  const query =
    options.query ??
    ((sql) =>
      queryRemoteD1(source, sql, {
        attempt: options.attempt ?? attemptRun,
        capture: options.capture,
        emit: options.emit ?? emitCommandOutput
      }));
  const expectedNormalMigrations = migrationNames(resolve(source, "migrations"));
  const packagedAfterDeployMigrations = migrationNames(resolve(source, "migrations-after-deploy"));
  if (!sameList(packagedAfterDeployMigrations, afterDeployMigrations)) {
    throw inconsistentState("The signed release has an unknown after-deploy migration sequence.");
  }

  const normalMigrations = rowsOfStrings(
    query("SELECT name FROM d1_migrations ORDER BY id"),
    "name"
  );
  const schemaItems = rowsOfStrings(query(afterDeploySchemaSql), "item");
  const hasAfterDeployLedger = schemaItems.includes("table:d1_migrations_after_deploy");
  const appliedAfterDeployMigrations = hasAfterDeployLedger
    ? rowsOfStrings(query("SELECT name FROM d1_migrations_after_deploy ORDER BY id"), "name")
    : [];
  const pendingUpdates = query(
    `SELECT id, from_version, to_version, checkpoint_bookmark, worker_version, state
     FROM update_history
     WHERE to_version = ${quote(version)} AND state IN ('started', 'deployed')
     ORDER BY started_at, rowid`
  );

  return classifyAfterDeployState({
    appliedAfterDeployMigrations,
    expectedNormalMigrations,
    hasAfterDeployLedger,
    normalMigrations,
    pendingUpdates,
    schemaItems
  });
}

export function classifyAfterDeployState({
  appliedAfterDeployMigrations,
  expectedNormalMigrations,
  hasAfterDeployLedger,
  normalMigrations,
  pendingUpdates = [],
  schemaItems
}) {
  if (!sameList(normalMigrations, expectedNormalMigrations)) {
    throw inconsistentState("The normal migration ledger is not complete.");
  }
  const phaseIndex = afterDeployMigrations.findIndex(
    (name, index) => appliedAfterDeployMigrations[index] !== name
  );
  const appliedCount = phaseIndex === -1 ? afterDeployMigrations.length : phaseIndex;
  if (
    appliedAfterDeployMigrations.length !== appliedCount ||
    appliedAfterDeployMigrations.length > afterDeployMigrations.length
  ) {
    throw inconsistentState("The after-deploy migration ledger is not an exact prefix.");
  }
  if (appliedCount > 0 && !hasAfterDeployLedger) {
    throw inconsistentState("The after-deploy migration ledger table is missing.");
  }
  if (!Array.isArray(pendingUpdates) || pendingUpdates.length > 1) {
    throw inconsistentState("More than one update is pending for this release.");
  }

  const actual = new Set(schemaItems);
  const expected = expectedSchemaItems(appliedCount, hasAfterDeployLedger);
  if (actual.size !== schemaItems.length || !sameSet(actual, expected)) {
    throw inconsistentState("The migration ledger and the live schema do not match.");
  }

  const pendingUpdate = pendingUpdates[0] ?? null;
  if (
    pendingUpdate &&
    [
      pendingUpdate.id,
      pendingUpdate.from_version,
      pendingUpdate.to_version,
      pendingUpdate.checkpoint_bookmark,
      pendingUpdate.worker_version,
      pendingUpdate.state
    ].some((value) => typeof value !== "string" || !value)
  ) {
    throw inconsistentState("The pending update recovery record is incomplete.");
  }

  return {
    phase: `S${appliedCount}`,
    pendingUpdate,
    repairRequired: appliedCount < afterDeployMigrations.length || pendingUpdate !== null
  };
}

export function queryRemoteD1(source, sql, options = {}) {
  const args = [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "--command",
    sql,
    "--config",
    "wrangler.jsonc"
  ];
  if (options.capture) return parseD1Rows(options.capture("pnpm", args, source));

  const result = (options.attempt ?? attemptRun)("pnpm", args, source);
  if (result.error || result.status !== 0) {
    (options.emit ?? emitCommandOutput)(result);
    throw (
      result.error ??
      new Error(`wrangler d1 inspection exited with status ${result.status ?? "signal"}.`)
    );
  }
  return parseD1Rows(result.stdout);
}

export function parseD1Rows(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Wrangler returned invalid D1 inspection JSON.");
  }
  const inspection = findResultSets(parsed);
  if (inspection.failed) throw new Error("Wrangler reported a failed D1 inspection statement.");
  if (inspection.resultSets.length === 0) {
    throw new Error("Wrangler returned no D1 inspection results.");
  }
  return inspection.resultSets.flat();
}

function expectedSchemaItems(appliedCount, hasAfterDeployLedger) {
  const items = [
    ...requiredTables.map((name) => `table:${name}`),
    ...requiredColumns.map((name) => `column:${name}`),
    ...requiredTriggers.map((name) => `trigger:${name}`),
    ...requiredForeignKeys.map((name) => `foreign-key:${name}`)
  ];
  if (hasAfterDeployLedger) items.push("table:d1_migrations_after_deploy");
  if (appliedCount === 0) {
    items.push(
      ...addressTransitionTables.map((name) => `table:${name}`),
      ...addressTransitionColumns.map((name) => `column:${name}`),
      ...addressTransitionTriggers.map((name) => `trigger:${name}`)
    );
  }
  if (appliedCount < 2) {
    items.push(
      ...principalTransitionColumns.map((name) => `column:${name}`),
      ...principalTransitionTriggers.map((name) => `trigger:${name}`),
      ...principalTransitionForeignKeys.map((name) => `foreign-key:${name}`)
    );
  }
  if (appliedCount >= 3) items.push(`foreign-key:${draftLabelsForeignKey}`);
  if (appliedCount >= 4) items.push(...pendingSendGuards.map((name) => `trigger:${name}`));
  return new Set(items);
}

function migrationNames(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function rowsOfStrings(rows, key) {
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.[key] !== "string")) {
    throw new Error("Wrangler returned invalid D1 inspection rows.");
  }
  return rows.map((row) => row[key]);
}

function sameList(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function findResultSets(value, inspection = { failed: false, resultSets: [] }) {
  if (!value || typeof value !== "object") return inspection;
  if (!Array.isArray(value) && value.success === false) inspection.failed = true;
  if (!Array.isArray(value) && Array.isArray(value.results)) {
    inspection.resultSets.push(value.results);
    return inspection;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    findResultSets(child, inspection);
  }
  return inspection;
}

function inconsistentState(detail) {
  return new Error(
    `Refusing to repair HQBase because the D1 post-deploy state is inconsistent. ${detail}`
  );
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlList(values) {
  return values.map(quote).join(", ");
}
