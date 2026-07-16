import { describe, expect, it } from "vitest";
import {
  openUpgradeContinuation,
  sealUpgradeContinuation
} from "../../../../worker/features/upgrades/cookies";
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

  it("stores resumable purchase material only as authenticated ciphertext", async () => {
    const continuation = {
      upgradeId: "upgrade-1",
      licenseKey: "polar-license-value",
      orchestrationSecret: "orchestration-secret-value"
    };
    const ciphertext = await sealUpgradeContinuation(continuation, "better-auth-secret");
    expect(ciphertext).not.toContain(continuation.licenseKey);
    expect(ciphertext).not.toContain(continuation.orchestrationSecret);
    await expect(openUpgradeContinuation(ciphertext, "better-auth-secret")).resolves.toEqual(
      continuation
    );
    await expect(openUpgradeContinuation(ciphertext, "wrong-secret")).rejects.toThrow();
  });
});
