import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EntitlementStatus } from "@/features/billing/types";
import type { UpgradeLifecycle } from "@/features/upgrades/types";
import { UpgradeSettings } from "@/features/upgrades/upgrade-settings";

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

describe("upgrade settings", () => {
  it("exposes checklist status text and a labelled verification form", () => {
    const html = renderToStaticMarkup(
      <UpgradeSettings
        entitlement={entitlement}
        lifecycle={lifecycle}
        onChanged={() => undefined}
      />
    );
    expect(html).toContain('aria-label="Community upgrade progress"');
    expect(html).toContain("Complete");
    expect(html).toContain("Pending");
    expect(html).toContain('for="upgrade-cloudflare-token"');
    expect(html).toContain('type="submit"');
  });

  it("hides cutover credentials after verification", () => {
    const html = renderToStaticMarkup(
      <UpgradeSettings
        entitlement={{ ...entitlement, state: "active", displayKey: "HQB_••••TEST" }}
        lifecycle={{ ...lifecycle, state: "cutover_verified" }}
        onChanged={() => undefined}
      />
    );
    expect(html).toContain("Verified");
    expect(html).not.toContain("Temporary Cloudflare API token");
  });
});
