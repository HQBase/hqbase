import {
  PersonalAccessTokenError,
  type PersonalAccessTokenPrincipalRow,
  validatePersonalAccessTokenPrincipalRow
} from "@worker/auth/personal-access-token-principal";
import { describe, expect, it } from "vitest";

const now = Date.parse("2026-08-20T18:00:00.000Z");

describe("personal access token principal row validation", () => {
  it("returns a principal for valid access states", () => {
    expect(validatePersonalAccessTokenPrincipalRow(validRow(), now)).toEqual({
      tokenId: "pat_principal_valid",
      user: {
        id: "better-auth-user-id",
        email: "principal@example.com",
        name: "",
        role: "member"
      }
    });
    expect(
      validatePersonalAccessTokenPrincipalRow(
        validRow({ expiresAt: "2026-08-20T18:00:00.001Z" }),
        now
      ).tokenId
    ).toBe("pat_principal_valid");
  });

  it.each([
    ["expiry equality", "2026-08-20T18:00:00.000Z"],
    ["past expiry", "2026-08-20T17:59:59.999Z"],
    ["malformed expiry", "not-a-time"],
    ["wrong expiry scalar", 1]
  ])("rejects %s", (_label, expiresAt) => {
    expectPrincipalError(validRow({ expiresAt }));
  });

  it.each([
    ["timestamp revocation", "2026-08-20T17:00:00.000Z"],
    ["numeric revocation", 0],
    ["object revocation", { stored: true }]
  ])("rejects %s without parsing it", (_label, revokedAt) => {
    expectPrincipalError(validRow({ revokedAt }));
  });

  it.each([
    ["null ban state", null],
    ["unbanned state", 0]
  ])("accepts %s", (_label, banned) => {
    expect(validatePersonalAccessTokenPrincipalRow(validRow({ banned }), now).tokenId).toBe(
      "pat_principal_valid"
    );
  });

  it.each([
    ["string zero", "0"],
    ["string one", "1"],
    ["other text", "other"],
    ["negative integer", -1],
    ["integer above one", 2],
    ["fraction", 0.5],
    ["binary value", new Uint8Array([1])]
  ])("rejects unsupported banned value: %s", (_label, banned) => {
    expectPrincipalError(validRow({ banned }));
  });

  it("ignores ban expiry when the user is not banned", () => {
    for (const banned of [null, 0]) {
      expect(
        validatePersonalAccessTokenPrincipalRow(
          validRow({ banned, banExpires: new Uint8Array([1]) }),
          now
        ).tokenId
      ).toBe("pat_principal_valid");
    }
  });

  it.each([
    ["permanent ban", null],
    ["active temporary ban", "2026-08-20T18:00:00.001Z"],
    ["malformed temporary ban", "not-a-time"],
    ["wrong temporary ban scalar", 1]
  ])("rejects %s", (_label, banExpires) => {
    expectPrincipalError(validRow({ banned: 1, banExpires }));
  });

  it.each([
    ["expiry equality", "2026-08-20T18:00:00.000Z"],
    ["expired temporary ban", "2026-08-20T17:59:59.999Z"]
  ])("accepts banned state with %s", (_label, banExpires) => {
    expect(
      validatePersonalAccessTokenPrincipalRow(validRow({ banned: 1, banExpires }), now).tokenId
    ).toBe("pat_principal_valid");
  });

  it.each([
    ["pending onboarding", "pending"],
    ["unsupported onboarding", "other"],
    ["wrong onboarding scalar", 1]
  ])("rejects %s", (_label, onboardingStatus) => {
    expectPrincipalError(validRow({ onboardingStatus }));
  });

  it.each([
    ["no onboarding row", null],
    ["complete onboarding", "complete"]
  ])("accepts %s", (_label, onboardingStatus) => {
    expect(
      validatePersonalAccessTokenPrincipalRow(validRow({ onboardingStatus }), now).tokenId
    ).toBe("pat_principal_valid");
  });

  it.each([
    ["token ID without prefix", { tokenId: "principal_valid" }],
    ["token ID with unsupported text", { tokenId: "pat_invalid!" }],
    ["numeric token ID", { tokenId: 1 }],
    ["empty user ID", { userId: "" }],
    ["numeric user ID", { userId: 1 }],
    ["invalid email", { email: "not-an-email" }],
    ["numeric email", { email: 1 }],
    ["numeric name", { name: 1 }],
    ["missing role", { role: null }],
    ["unsupported role", { role: "operator" }],
    ["numeric role", { role: 1 }]
  ] satisfies ReadonlyArray<
    readonly [string, Partial<PersonalAccessTokenPrincipalRow>]
  >)("rejects invalid identity or role: %s", (_label, values) => {
    expectPrincipalError(validRow(values));
  });
});

function validRow(
  values: Partial<PersonalAccessTokenPrincipalRow> = {}
): PersonalAccessTokenPrincipalRow {
  return {
    tokenId: "pat_principal_valid",
    userId: "better-auth-user-id",
    email: "principal@example.com",
    name: "",
    role: "member",
    banned: null,
    banExpires: null,
    onboardingStatus: null,
    expiresAt: null,
    revokedAt: null,
    ...values
  };
}

function expectPrincipalError(row: PersonalAccessTokenPrincipalRow): void {
  try {
    validatePersonalAccessTokenPrincipalRow(row, now);
  } catch (error) {
    expect(error).toBeInstanceOf(PersonalAccessTokenError);
    return;
  }
  throw new Error("Expected personal access token access to be rejected.");
}
