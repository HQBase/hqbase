import { describe, expect, it } from "vitest";
import { cloudflare } from "../../../../worker/features/upgrades/cloudflare";
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

  it("lets fetch set the multipart boundary for candidate uploads", async () => {
    const form = new FormData();
    form.set("metadata", "{}");
    const fetcher: typeof fetch = async (_input, init) => {
      expect(new Headers(init?.headers).has("content-type")).toBe(false);
      return Response.json({ success: true, result: { id: "candidate-version" } });
    };

    await expect(
      cloudflare(
        "short-lived-token",
        "/accounts/account/workers/scripts/worker/versions",
        {
          method: "POST",
          body: form
        },
        fetcher
      )
    ).resolves.toEqual({ id: "candidate-version" });
  });
});
