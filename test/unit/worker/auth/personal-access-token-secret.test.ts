import { describe, expect, it } from "vitest";
import {
  generatePersonalAccessToken,
  hashPersonalAccessToken,
  parsePersonalAccessToken
} from "../../../../worker/auth/personal-access-token-secret";
import { assertSecretSafeEqual } from "../../../helpers/secret-safe-assertions";

describe("personal access token secrets", () => {
  it("generates a canonical 256-bit PAT and a stable hash", async () => {
    const first = await generatePersonalAccessToken();
    const second = await generatePersonalAccessToken();
    expect(/^hqb_pat_[A-Za-z0-9_-]{43}$/u.test(first.token)).toBe(true);
    expect(first.token !== second.token).toBe(true);
    expect(/^[A-Za-z0-9_-]{43}$/u.test(first.tokenHash)).toBe(true);
    assertSecretSafeEqual(first.tokenHash, await hashPersonalAccessToken(first.token));
    assertSecretSafeEqual(first.tokenSuffix, first.token.slice(-4));
    assertSecretSafeEqual(parsePersonalAccessToken(first.token), first.token);
  });

  it("hashes the complete prefixed plaintext", async () => {
    const fixedNonSecretVector = `hqb_pat_${"A".repeat(43)}`;
    assertSecretSafeEqual(
      await hashPersonalAccessToken(fixedNonSecretVector),
      "NL3kqdezjVTNN-Swiu5QQhalwm-OrMKYkuMww0solic"
    );
  });

  it.each([
    { label: "wrong prefix", value: "hqb_access_value" },
    { label: "empty secret", value: "hqb_pat_" },
    { label: "short secret", value: `hqb_pat_${"a".repeat(42)}` },
    { label: "long secret", value: `hqb_pat_${"a".repeat(44)}` },
    { label: "invalid alphabet", value: `hqb_pat_${"a".repeat(42)}+` }
  ])("rejects malformed PAT text: $label", ({ value }) => {
    expect(() => parsePersonalAccessToken(value)).toThrow("Personal access token is malformed.");
  });

  it("rejects noncanonical Base64url trailing bits", () => {
    const noncanonical = `hqb_pat_${"A".repeat(42)}B`;
    expect(() => parsePersonalAccessToken(noncanonical)).toThrow(
      "Personal access token is malformed."
    );
  });
});
