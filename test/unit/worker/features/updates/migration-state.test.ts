import {
  afterDeployMigrationNames,
  classifyManagedMigrationState,
  type ManagedMigrationSnapshot,
  normalMigrationNames,
  transitionGuards
} from "@worker/features/updates/migration-state";
import { describe, expect, it } from "vitest";

describe("managed update migration state", () => {
  it.each([
    [0, "stale", true],
    [1, "partial", true],
    [2, "partial", true],
    [3, "clean", false]
  ] as const)("accepts the exact S%s migration state", (completed, state, repairRequired) => {
    expect(classifyManagedMigrationState(snapshot(completed), "1.3.3", 3)).toEqual({
      completedAfterDeployMigrations: completed,
      repairRequired,
      state
    });
  });

  it("accepts an empty after-deploy ledger as S0", () => {
    expect(
      classifyManagedMigrationState({ ...snapshot(0), afterDeployLedger: [] }, "1.3.3", 3)
    ).toMatchObject({ completedAfterDeployMigrations: 0, repairRequired: true });
  });

  it("offers a retry for exact pending bookkeeping after schema cleanup", () => {
    expect(
      classifyManagedMigrationState(
        {
          ...snapshot(3),
          pendingUpdates: [pendingUpdate()],
          releaseState: {
            channel: "stable",
            installed_schema_version: 3,
            installed_version: "1.3.2",
            product: "hqbase"
          }
        },
        "1.3.3",
        3
      )
    ).toEqual({
      completedAfterDeployMigrations: 3,
      repairRequired: true,
      state: "partial"
    });
  });

  it.each([
    ["an incomplete normal ledger", { normalLedger: normalMigrationNames.slice(0, -1) }],
    ["a non-prefix after-deploy ledger", { afterDeployLedger: [afterDeployMigrationNames[1]] }],
    [
      "a missing ledger with partially cleaned aliases",
      {
        afterDeployLedger: null,
        tables: [],
        transitionGuards: [],
        columns: snapshot(1).columns
      }
    ],
    ["a completed ledger with legacy principal columns", { columns: snapshot(1).columns }],
    ["a completed ledger without the final draft-label foreign key", { draftLabelForeignKeys: [] }]
  ])("rejects %s", (_label, replacement) => {
    expect(() =>
      classifyManagedMigrationState({ ...snapshot(3), ...replacement }, "1.3.3", 3)
    ).toThrow("HQBASE_MANAGED_MIGRATION_STATE_INVALID");
  });

  it.each([
    ["multiple pending rows", { pendingUpdates: [pendingUpdate(), pendingUpdate("second")] }],
    [
      "a malformed pending row",
      { pendingUpdates: [{ ...pendingUpdate(), checkpoint_bookmark: "" }] }
    ],
    [
      "a release marker for an unrelated version",
      {
        pendingUpdates: [pendingUpdate()],
        releaseState: {
          channel: "stable",
          installed_schema_version: 3,
          installed_version: "1.2.0",
          product: "hqbase"
        }
      }
    ],
    [
      "a clean release with a stale schema marker",
      {
        releaseState: {
          channel: "stable",
          installed_schema_version: 2,
          installed_version: "1.3.3",
          product: "hqbase"
        }
      }
    ]
  ])("rejects %s", (_label, replacement) => {
    expect(() =>
      classifyManagedMigrationState({ ...snapshot(3), ...replacement }, "1.3.3", 3)
    ).toThrow("HQBASE_MANAGED_MIGRATION_STATE_INVALID");
  });
});

function snapshot(completed: 0 | 1 | 2 | 3): ManagedMigrationSnapshot {
  const aliasesAreLegacy = completed === 0;
  const principalsAreLegacy = completed < 2;
  return {
    afterDeployLedger: completed === 0 ? null : [...afterDeployMigrationNames.slice(0, completed)],
    columns: {
      draft_changes: ["sequence", "principal_id", ...(principalsAreLegacy ? ["user_id"] : [])],
      drafts: ["id", "principal_id", ...(principalsAreLegacy ? ["user_id"] : [])],
      mailbox_grants: [
        "mailbox_id",
        "principal_id",
        ...(principalsAreLegacy ? ["created_by", "user_id"] : [])
      ],
      messages: [
        "id",
        "delivered_to_address",
        ...(aliasesAreLegacy ? ["delivered_to_address_id", "sent_from_address_id"] : [])
      ]
    },
    draftLabelForeignKeys:
      completed === 3
        ? [
            {
              from: "draft_id",
              on_delete: "CASCADE",
              table: "drafts",
              to: "id"
            }
          ]
        : [],
    normalLedger: [...normalMigrationNames],
    pendingUpdates: [],
    releaseState: {
      channel: "stable",
      installed_schema_version: 3,
      installed_version: "1.3.3",
      product: "hqbase"
    },
    tables: aliasesAreLegacy ? ["mailbox_address_migration", "mailbox_addresses"] : [],
    transitionGuards: aliasesAreLegacy ? [...transitionGuards] : []
  };
}

function pendingUpdate(id = "repair-update") {
  return {
    checkpoint_bookmark: "bookmark-before-update",
    from_version: "1.3.2",
    id,
    state: "started",
    to_version: "1.3.3",
    worker_version: "worker-before-update"
  };
}
