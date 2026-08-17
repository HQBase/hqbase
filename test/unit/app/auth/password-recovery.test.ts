import { describe, expect, it } from "vitest";

import {
  authenticationPath,
  safeAuthenticationReturnPath
} from "@/features/auth/password-recovery";

describe("password recovery return paths", () => {
  it("keeps a same-origin OAuth or device path", () => {
    expect(
      safeAuthenticationReturnPath("/device?user_code=ABCD-EFGH", "https://mail.example.com")
    ).toBe("/device?user_code=ABCD-EFGH");
    expect(authenticationPath("/forgot-password", "/device?user_code=ABCD-EFGH")).toBe(
      "/forgot-password?returnTo=%2Fdevice%3Fuser_code%3DABCD-EFGH"
    );
  });

  it("rejects external, malformed, and recursive recovery destinations", () => {
    expect(
      safeAuthenticationReturnPath("https://attacker.example/path", "https://mail.example.com")
    ).toBe("/");
    expect(safeAuthenticationReturnPath("https://%", "https://mail.example.com")).toBe("/");
    expect(safeAuthenticationReturnPath("/reset-password", "https://mail.example.com")).toBe("/");
  });
});
