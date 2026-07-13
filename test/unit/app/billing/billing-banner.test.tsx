import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingBanner } from "@/features/billing/billing-banner";
import type { EntitlementStatus } from "@/features/billing/types";

const baseStatus: EntitlementStatus = {
  installationId: "installation-1",
  state: "active",
  canConfigure: true,
  displayKey: "HQB_••••TEST",
  currentPeriodEnd: "2026-08-13T00:00:00.000Z",
  checkedAt: "2026-07-13T12:00:00.000Z",
  graceEndsAt: null,
  lastError: null
};

describe("billing banner", () => {
  it("stays quiet for an active entitlement", () => {
    expect(renderToStaticMarkup(<BillingBanner status={baseStatus} />)).toBe("");
  });

  it.each([
    ["unlicensed", "Activate HQBase Pro"],
    ["canceling", "Your subscription will not renew"],
    ["past_due", "Payment needs attention"],
    ["grace", "Pro is in a safety grace period"],
    ["inactive", "Pro administration is paused"]
  ] as const)("renders explicit %s status copy", (state, title) => {
    const html = renderToStaticMarkup(
      <BillingBanner status={{ ...baseStatus, state, canConfigure: state !== "inactive" }} />
    );
    expect(html).toContain("License status:");
    expect(html).toContain(title);
    expect(html).toContain('aria-live="polite"');
  });
});
