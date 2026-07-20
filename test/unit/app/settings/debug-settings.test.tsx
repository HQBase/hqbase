import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EntitlementStatus } from "@/features/billing/types";
import { buildDebugReport, DebugSettings } from "@/features/settings/debug-settings";
import type { SetupStatus } from "@/features/setup/types";
import type { UpgradeLifecycle } from "@/features/upgrades/types";

const setup: SetupStatus = {
  isComplete: true,
  primaryDomain: "example.com",
  portalHostname: "mail.example.com",
  serviceHostname: "bridge.example.com",
  domains: [{ id: "domain-1", name: "example.com", isEnabled: true }],
  userCount: 3,
  mailboxCount: 4,
  checklistAcknowledged: true
};

const entitlement: EntitlementStatus = {
  installationId: "installation-1",
  state: "unlicensed",
  canConfigure: true,
  displayKey: null,
  currentPeriodEnd: null,
  checkedAt: null,
  graceEndsAt: null,
  lastError: null
};

const lifecycle: UpgradeLifecycle = {
  sourceEdition: "community",
  state: "migrated",
  checkpointBookmark: "bookmark-1",
  backupR2Key: "_hqbase/backups/upgrade.sql",
  sourceWorkerName: "hqbase-community",
  targetWorkerName: "hqbase-pro",
  startedAt: "2026-07-13T12:00:00.000Z",
  migratedAt: "2026-07-13T12:01:00.000Z",
  deployedAt: null,
  cutoverVerifiedAt: null,
  updatedAt: "2026-07-13T12:01:00.000Z"
};

describe("debug settings", () => {
  it("combines deployment and upgrade state into one code-like report", () => {
    const report = buildDebugReport(setup, entitlement, lifecycle);

    expect(report).toContain("# workspace");
    expect(report).toContain('primary_domain = "example.com"');
    expect(report).not.toContain("service_hostname");
    expect(report).toContain("# community_upgrade");
    expect(report).toContain('state = "migrated"');
    expect(report).toContain('checkpoint_bookmark = "bookmark-1"');
  });

  it("keeps grant-backed cutover verification beneath the read-only report", () => {
    const html = renderToStaticMarkup(
      <DebugSettings
        entitlement={entitlement}
        setup={setup}
        upgrade={lifecycle}
        onUpgradeChanged={() => undefined}
      />
    );

    expect(html).toContain('aria-label="HQBase Pro debug report"');
    expect(html).toContain("readOnly");
    expect(html).toContain("Verify Pro cutover");
    expect(html).toContain("No customer credential is required");
    expect(html).not.toContain('type="password"');
  });

  it("shows that no Community upgrade exists for a fresh Pro install", () => {
    expect(buildDebugReport(setup, entitlement, null)).toContain("present = false");
  });
});
