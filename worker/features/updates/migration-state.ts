import {
  afterDeployMigrationNames,
  normalMigrationNames,
  pendingSendGuards
} from "./migration-names";

export {
  afterDeployMigrationNames,
  normalMigrationNames,
  pendingSendGuards
} from "./migration-names";

const aliasTables = ["mailbox_address_migration", "mailbox_addresses"] as const;
const aliasMessageColumns = ["delivered_to_address_id", "sent_from_address_id"] as const;
const principalLegacyColumns = {
  draft_changes: ["user_id"],
  drafts: ["user_id"],
  mailbox_grants: ["created_by", "user_id"]
} as const;
export const transitionGuards = [
  "mailbox_addresses_transition_delete_guard",
  "mailbox_addresses_transition_insert_guard",
  "mailbox_addresses_transition_update_guard",
  "mailbox_grants_transition_delete_guard",
  "mailbox_grants_transition_insert_guard",
  "mailbox_grants_transition_update_guard",
  "mailboxes_transition_delete_guard",
  "mailboxes_transition_update_guard",
  "retention_policies_transition_delete_guard",
  "retention_policies_transition_insert_guard",
  "retention_policies_transition_update_guard"
] as const;

export type ManagedMigrationState = {
  completedAfterDeployMigrations: 0 | 1 | 2 | 3 | 4;
  repairRequired: boolean;
  state: "stale" | "partial" | "clean";
};

export type ManagedMigrationSnapshot = {
  afterDeployLedger: string[] | null;
  columns: Record<"draft_changes" | "drafts" | "mailbox_grants" | "messages", string[]>;
  draftLabelForeignKeys: Array<{
    from: string;
    on_delete: string;
    table: string;
    to: string;
  }>;
  normalLedger: string[];
  pendingUpdates: Array<{
    checkpoint_bookmark: string;
    from_version: string;
    id: string;
    state: string;
    to_version: string;
    worker_version: string;
  }>;
  releaseState: {
    channel: string;
    installed_schema_version: number;
    installed_version: string;
    product: string;
  } | null;
  tables: string[];
  transitionGuards: string[];
  pendingSendGuards: string[];
};

export async function inspectManagedMigrationState(
  database: D1Database,
  expectedVersion: string,
  expectedSchemaVersion: number
): Promise<ManagedMigrationState> {
  const objects = await database
    .prepare(
      `SELECT type, name
       FROM sqlite_schema
       WHERE name IN (
         'd1_migrations',
         'd1_migrations_after_deploy',
         'mailbox_address_migration',
         'mailbox_addresses',
         ${pendingSendGuards.map((name) => `'${name}'`).join(", ")},
         ${transitionGuards.map((name) => `'${name}'`).join(", ")}
       )`
    )
    .all<{ name: string; type: string }>();
  const foundTables = objects.results
    .filter(({ type }) => type === "table")
    .map(({ name }) => name);
  if (!foundTables.includes("d1_migrations")) {
    throw inconsistentState();
  }

  const normalLedger = await migrationLedger(database, "d1_migrations");
  const afterDeployLedger = foundTables.includes("d1_migrations_after_deploy")
    ? await migrationLedger(database, "d1_migrations_after_deploy")
    : null;
  const columns = {
    draft_changes: await tableColumns(database, "draft_changes"),
    drafts: await tableColumns(database, "drafts"),
    mailbox_grants: await tableColumns(database, "mailbox_grants"),
    messages: await tableColumns(database, "messages")
  };
  const foreignKeys = await database
    .prepare("PRAGMA foreign_key_list(draft_labels)")
    .all<{ from: string; on_delete: string; table: string; to: string }>();
  const releaseState = await database
    .prepare(
      "SELECT product, installed_version, installed_schema_version, channel FROM release_state WHERE singleton = 1"
    )
    .all<{
      channel: string;
      installed_schema_version: number;
      installed_version: string;
      product: string;
    }>();
  const pendingUpdates = await database
    .prepare(
      `SELECT id, from_version, to_version, checkpoint_bookmark, worker_version, state
       FROM update_history
       WHERE to_version = ? AND state IN ('started', 'deployed')
       ORDER BY started_at, rowid`
    )
    .bind(expectedVersion)
    .all<{
      checkpoint_bookmark: string;
      from_version: string;
      id: string;
      state: string;
      to_version: string;
      worker_version: string;
    }>();

  return classifyManagedMigrationState(
    {
      afterDeployLedger,
      columns,
      draftLabelForeignKeys: foreignKeys.results,
      normalLedger,
      pendingUpdates: pendingUpdates.results,
      releaseState: releaseState.results.length === 1 ? (releaseState.results[0] ?? null) : null,
      tables: foundTables.filter((name) =>
        aliasTables.includes(name as (typeof aliasTables)[number])
      ),
      pendingSendGuards: objects.results
        .filter(
          ({ type, name }) =>
            type === "trigger" && pendingSendGuards.some((guard) => guard === name)
        )
        .map(({ name }) => name),
      transitionGuards: objects.results
        .filter(
          ({ type, name }) => type === "trigger" && transitionGuards.some((guard) => guard === name)
        )
        .map(({ name }) => name)
    },
    expectedVersion,
    expectedSchemaVersion
  );
}

export function classifyManagedMigrationState(
  snapshot: ManagedMigrationSnapshot,
  expectedVersion: string,
  expectedSchemaVersion: number
): ManagedMigrationState {
  if (!same(snapshot.normalLedger, normalMigrationNames)) throw inconsistentState();
  if (snapshot.pendingUpdates.length > 1) throw inconsistentState();
  const pendingUpdate = snapshot.pendingUpdates[0] ?? null;
  if (
    pendingUpdate &&
    (pendingUpdate.to_version !== expectedVersion ||
      !stableVersion.test(pendingUpdate.from_version) ||
      !["started", "deployed"].includes(pendingUpdate.state) ||
      [pendingUpdate.id, pendingUpdate.checkpoint_bookmark, pendingUpdate.worker_version].some(
        (value) => typeof value !== "string" || !value
      ))
  ) {
    throw inconsistentState();
  }
  const releaseState = snapshot.releaseState;
  const releaseMarkerMatches =
    releaseState?.product === "hqbase" &&
    releaseState.channel === "stable" &&
    Number.isInteger(releaseState.installed_schema_version) &&
    releaseState.installed_schema_version > 0 &&
    (pendingUpdate === null
      ? releaseState.installed_schema_version === expectedSchemaVersion
      : releaseState.installed_schema_version <= expectedSchemaVersion) &&
    (releaseState.installed_version === expectedVersion ||
      (pendingUpdate !== null && releaseState.installed_version === pendingUpdate.from_version));
  if (!releaseMarkerMatches) throw inconsistentState();
  const ledger = snapshot.afterDeployLedger ?? [];
  const completed = afterDeployMigrationNames.findIndex((name, index) => ledger[index] !== name);
  const completedCount = completed === -1 ? afterDeployMigrationNames.length : completed;
  if (ledger.length !== completedCount) throw inconsistentState();

  const aliasLegacy =
    includesExactly(snapshot.tables, aliasTables) &&
    includesAll(snapshot.columns.messages, aliasMessageColumns) &&
    includesExactly(snapshot.transitionGuards, transitionGuards);
  const aliasFinal =
    includesNone(snapshot.tables, aliasTables) &&
    includesNone(snapshot.columns.messages, aliasMessageColumns) &&
    includesNone(snapshot.transitionGuards, transitionGuards);
  const principalLegacy = Object.entries(principalLegacyColumns).every(([table, columns]) =>
    includesAll(snapshot.columns[table as keyof typeof principalLegacyColumns], columns)
  );
  const principalFinal = Object.entries(principalLegacyColumns).every(([table, columns]) =>
    includesNone(snapshot.columns[table as keyof typeof principalLegacyColumns], columns)
  );
  const draftForeignKeys = snapshot.draftLabelForeignKeys.filter(
    (foreignKey) => foreignKey.from === "draft_id"
  );
  const hasFinalDraftLabelForeignKey =
    draftForeignKeys.length === 1 &&
    draftForeignKeys.some(
      (foreignKey) =>
        foreignKey.table === "drafts" &&
        foreignKey.from === "draft_id" &&
        foreignKey.to === "id" &&
        foreignKey.on_delete.toUpperCase() === "CASCADE"
    );
  const baseSchemaPresent =
    includesAll(snapshot.columns.messages, ["id", "delivered_to_address"]) &&
    includesAll(snapshot.columns.mailbox_grants, ["mailbox_id", "principal_id"]) &&
    includesAll(snapshot.columns.drafts, ["id", "principal_id"]) &&
    includesAll(snapshot.columns.draft_changes, ["sequence", "principal_id"]);

  const valid =
    baseSchemaPresent &&
    (completedCount === 4
      ? includesExactly(snapshot.pendingSendGuards, pendingSendGuards)
      : snapshot.pendingSendGuards.length === 0) &&
    ((completedCount === 0 && aliasLegacy && principalLegacy && draftForeignKeys.length === 0) ||
      (completedCount === 1 && aliasFinal && principalLegacy && draftForeignKeys.length === 0) ||
      (completedCount === 2 && aliasFinal && principalFinal && draftForeignKeys.length === 0) ||
      (completedCount >= 3 && aliasFinal && principalFinal && hasFinalDraftLabelForeignKey));
  if (!valid) throw inconsistentState();

  return {
    completedAfterDeployMigrations: completedCount as 0 | 1 | 2 | 3 | 4,
    repairRequired: completedCount < afterDeployMigrationNames.length || pendingUpdate !== null,
    state:
      completedCount === 0
        ? "stale"
        : completedCount === afterDeployMigrationNames.length && pendingUpdate === null
          ? "clean"
          : "partial"
  };
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function migrationLedger(database: D1Database, table: string): Promise<string[]> {
  const result = await database
    .prepare(`SELECT name FROM ${table} ORDER BY id`)
    .all<{ name: string }>();
  return result.results.map(({ name }) => name);
}

async function tableColumns(database: D1Database, table: string): Promise<string[]> {
  const result = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return result.results.map(({ name }) => name);
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function includesAll(values: readonly string[], expected: readonly string[]): boolean {
  return expected.every((value) => values.includes(value));
}

function includesNone(values: readonly string[], expected: readonly string[]): boolean {
  return expected.every((value) => !values.includes(value));
}

function includesExactly(values: readonly string[], expected: readonly string[]): boolean {
  return values.length === expected.length && includesAll(values, expected);
}

function inconsistentState(): Error {
  return new Error("HQBASE_MANAGED_MIGRATION_STATE_INVALID");
}
