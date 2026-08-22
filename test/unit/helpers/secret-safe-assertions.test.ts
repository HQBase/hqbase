import { describe, expect, it } from "vitest";
import { assertSecretSafeAbsent } from "../../helpers/secret-safe-assertions";

describe("secret-safe assertions", () => {
  it("inspects values after the default array limit", () => {
    const value = [...Array.from({ length: 101 }, () => "safe"), "synthetic-secret"];
    expect(() => assertSecretSafeAbsent(value, ["synthetic-secret"])).toThrow(
      "Secret-safe exclusion assertion failed."
    );
  });

  it("inspects values after the default string limit", () => {
    const value = { text: `${"safe".repeat(4_000)}synthetic-secret` };
    expect(() => assertSecretSafeAbsent(value, ["synthetic-secret"])).toThrow(
      "Secret-safe exclusion assertion failed."
    );
  });
});
