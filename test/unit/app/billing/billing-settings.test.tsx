import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingSettings } from "@/features/billing/billing-settings";
import type { EntitlementStatus } from "@/features/billing/types";

const unlicensed: EntitlementStatus = {
  installationId: "installation-1",
  state: "unlicensed",
  canConfigure: true,
  displayKey: null,
  currentPeriodEnd: null,
  checkedAt: null,
  graceEndsAt: null,
  lastError: null
};

describe("billing settings", () => {
  it("renders a labelled activation form and mobile-safe actions", () => {
    const html = renderToStaticMarkup(
      <BillingSettings status={unlicensed} onChanged={() => undefined} />
    );
    expect(html).toContain('for="pro-license-key"');
    expect(html).toContain('id="pro-license-key"');
    expect(html).toContain("Activate license");
    expect(html).toContain("Manage subscription");
    expect(html).toContain("flex-col items-stretch");
  });

  it("shows a bounded diagnostic for a failed subscription refresh", () => {
    const html = renderToStaticMarkup(
      <BillingSettings
        status={{
          ...unlicensed,
          state: "active",
          displayKey: "HQB_••••TEST",
          lastError: "refresh_failed"
        }}
        onChanged={() => undefined}
      />
    );
    expect(html).toContain("Subscription check needs attention");
    expect(html).toContain("last verified status");
    expect(html).toContain('aria-label="License status: Active"');
  });
});
