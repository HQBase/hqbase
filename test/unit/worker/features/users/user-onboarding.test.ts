import { generateTemporaryPassword } from "@worker/features/users/service";
import { describe, expect, it } from "vitest";

describe("user onboarding", () => {
  it("generates unique temporary passwords from cryptographic randomness", () => {
    const passwords = new Set(Array.from({ length: 32 }, () => generateTemporaryPassword()));

    expect(passwords.size).toBe(32);
    for (const password of passwords) {
      expect(password).toMatch(/^Hq![A-Za-z0-9_-]{24}$/);
      expect(password.length).toBeGreaterThanOrEqual(8);
    }
  });
});
