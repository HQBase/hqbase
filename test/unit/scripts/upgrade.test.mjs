import { describe, expect, it } from "vitest";

import {
  assertCommunitySchema,
  assertProSchema,
  validateUpgradeOptions
} from "../../../scripts/hqbase-pro/upgrade.mjs";

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

describe("Community to Pro upgrade", () => {
  it("requires an explicit source and exactly one target", () => {
    expect(() => validateUpgradeOptions({ database: "db", local: true })).toThrow(
      "--from-community"
    );
    expect(() =>
      validateUpgradeOptions({ "from-community": true, database: "db", local: true, remote: true })
    ).toThrow("exactly one target");
  });

  it("requires confirmation before mutating a remote database", () => {
    expect(() =>
      validateUpgradeOptions({ "from-community": true, database: "db", remote: true })
    ).toThrow("require --yes");
    expect(
      validateUpgradeOptions({
        "from-community": true,
        database: "db",
        remote: true,
        "dry-run": true
      })
    ).toMatchObject({ database: "db", dryRun: true, remote: true });
  });

  it("rejects unknown Community schemas before migration", () => {
    expect(() => assertCommunitySchema(communityTables.slice(1))).toThrow("Missing: account");
    expect(() => assertCommunitySchema(communityTables)).not.toThrow();
  });

  it("verifies every required Pro table", () => {
    expect(() => assertProSchema(["pro_schema_state"])).toThrow("pro_app_passwords");
    expect(() =>
      assertProSchema([
        "pro_app_passwords",
        "pro_bridge_mutations",
        "pro_bridge_submissions",
        "pro_imap_mailboxes",
        "pro_imap_messages",
        "pro_mail_sessions",
        "pro_mailbox_grants",
        "pro_audit_events",
        "pro_operation_runs",
        "pro_schema_state",
        "mail_domains",
        "mailbox_addresses",
        "workspace_hosts",
        "pro_drafts",
        "pro_draft_attachments",
        "pro_upgrade_lifecycle"
      ])
    ).not.toThrow();
  });
});
