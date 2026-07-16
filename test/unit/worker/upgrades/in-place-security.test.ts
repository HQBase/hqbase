import { describe, expect, it } from "vitest";
import { proUpgradeSecretNames } from "../../../../worker/features/upgrades/deployment";

describe("in-place upgrade secret boundary", () => {
  it("creates only new Pro secrets and never rotates Better Auth", () => {
    expect(proUpgradeSecretNames).toEqual(
      expect.arrayContaining([
        "PRO_APP_PASSWORD_PEPPER",
        "PRO_BRIDGE_TOKEN",
        "PRO_SESSION_SECRET",
        "PRO_ENTITLEMENT_SECRET",
        "PRO_LICENSE_KEY"
      ])
    );
    expect(proUpgradeSecretNames).not.toContain("BETTER_AUTH_SECRET");
  });
});
