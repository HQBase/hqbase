import { decryptLicenseKey, encryptLicenseKey } from "@worker/features/billing/crypto";
import { describe, expect, it } from "vitest";

describe("entitlement license encryption", () => {
  it("round-trips without storing the license in plaintext", async () => {
    const encrypted = await encryptLicenseKey("deployment secret", "HQB_EXAMPLE_LICENSE");
    expect(encrypted).not.toContain("HQB_EXAMPLE_LICENSE");
    await expect(decryptLicenseKey("deployment secret", encrypted)).resolves.toBe(
      "HQB_EXAMPLE_LICENSE"
    );
  });

  it("rejects malformed and incorrectly keyed ciphertext", async () => {
    await expect(decryptLicenseKey("secret", "malformed")).rejects.toThrow();
    const encrypted = await encryptLicenseKey("correct", "HQB_EXAMPLE_LICENSE");
    await expect(decryptLicenseKey("wrong", encrypted)).rejects.toThrow();
  });
});
