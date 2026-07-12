import { describe, expect, it } from "vitest";

import {
  classifyDatabaseTables,
  parseD1Rows,
  runDeployLifecycle,
  upgradeRecordSql
} from "../../../scripts/hqbase-pro/deploy.mjs";

const communityTables = [
  "account",
  "app_settings",
  "mailboxes",
  "message_attachments",
  "messages",
  "session",
  "threads",
  "user",
  "verification"
];

const proTables = [
  ...communityTables,
  "mail_domains",
  "mailbox_addresses",
  "pro_app_passwords",
  "pro_audit_events",
  "pro_bridge_mutations",
  "pro_bridge_submissions",
  "pro_draft_attachments",
  "pro_drafts",
  "pro_imap_mailboxes",
  "pro_imap_messages",
  "pro_mail_sessions",
  "pro_mailbox_grants",
  "pro_operation_runs",
  "pro_schema_state",
  "pro_upgrade_lifecycle",
  "workspace_hosts"
];

describe("Deploy lifecycle", () => {
  it("classifies fresh, Community, and Pro databases and rejects unknown data", () => {
    expect(classifyDatabaseTables(["d1_migrations"])).toBe("fresh");
    expect(classifyDatabaseTables(communityTables)).toBe("community");
    expect(classifyDatabaseTables(proTables)).toBe("pro");
    expect(() => classifyDatabaseTables(["customers"])).toThrow("not a recognized HQBase");
  });

  it("parses D1 result arrays without assertions", () => {
    expect(parseD1Rows(JSON.stringify([{ results: [{ name: "user" }] }, { results: [] }]))).toEqual(
      [{ name: "user" }]
    );
    expect(() => parseD1Rows("{}")).toThrow("invalid D1 JSON");
  });

  it("escapes every value written to the upgrade record", () => {
    const sql = upgradeRecordSql({
      backupR2Key: "_hqbase/backups/a'b.sql",
      bookmark: "bookmark'a",
      migratedAt: "2026-07-11T12:01:00.000Z",
      sourceWorkerName: null,
      startedAt: "2026-07-11T12:00:00.000Z",
      targetWorkerName: "hqbase-pro"
    });
    expect(sql).toContain("bookmark''a");
    expect(sql).toContain("a''b.sql");
    expect(sql).toContain("NULL");
  });

  it("checkpoints and backs up Community before migration and deploy", () => {
    const calls = [];
    let tableRead = 0;
    const run = (args) => {
      calls.push(args);
      if (args.some((arg) => arg.includes("sqlite_schema"))) {
        tableRead += 1;
        return d1Rows(tableRead === 1 ? communityTables : proTables);
      }
      if (args.includes("time-travel")) return JSON.stringify({ bookmark: "checkpoint-1" });
      return "";
    };
    const times = [new Date("2026-07-11T12:00:00.000Z"), new Date("2026-07-11T12:01:00.000Z")];

    expect(
      runDeployLifecycle({
        configFile: "/tmp/hqbase-pro-test-wrangler.jsonc",
        identity: {
          bucket: "community-mail",
          sourceWorkerName: "hqbase",
          targetWorkerName: "hqbase-pro"
        },
        now: () => times.shift(),
        run
      })
    ).toEqual({ source: "community" });

    const names = calls.map((args) => args.slice(0, 4).join(" "));
    expect(names).toContain("d1 time-travel info DB");
    expect(names).toContain("d1 export DB --remote");
    expect(
      calls.some((args) =>
        args.includes(
          "community-mail/_hqbase/backups/community-to-pro-2026-07-11T12-00-00.000Z.sql"
        )
      )
    ).toBe(true);
    expect(names).toContain("d1 migrations apply DB");
    expect(calls.some((args) => args[0] === "deploy")).toBe(true);

    const backupIndex = calls.findIndex((args) => args[0] === "r2");
    const migrationIndex = calls.findIndex((args) => args[1] === "migrations");
    const deployIndex = calls.findIndex((args) => args[0] === "deploy");
    expect(backupIndex).toBeLessThan(migrationIndex);
    expect(migrationIndex).toBeLessThan(deployIndex);
  });

  it("applies pending migrations without creating an upgrade checkpoint for fresh Pro", () => {
    const calls = [];
    let tableRead = 0;
    const run = (args) => {
      calls.push(args);
      if (args.some((arg) => arg.includes("sqlite_schema"))) {
        tableRead += 1;
        return d1Rows(tableRead === 1 ? [] : proTables);
      }
      return "";
    };

    expect(
      runDeployLifecycle({
        configFile: "/tmp/hqbase-pro-test-wrangler.jsonc",
        identity: {
          bucket: "fresh-mail",
          sourceWorkerName: null,
          targetWorkerName: "hqbase-pro"
        },
        run
      })
    ).toEqual({ source: "fresh" });
    expect(calls.some((args) => args[0] === "r2")).toBe(false);
    expect(calls.some((args) => args[0] === "deploy")).toBe(true);
  });
});

function d1Rows(tables) {
  return JSON.stringify([{ results: tables.map((name) => ({ name })) }]);
}
