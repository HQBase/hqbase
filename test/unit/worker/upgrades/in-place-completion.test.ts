import { describe, expect, it } from "vitest";
import { completionUpgradeSql } from "../../../../worker/features/upgrades/in-place";

describe("in-place upgrade completion", () => {
  it("clears durable continuation ciphertext when the Community schema supports it", () => {
    expect(completionUpgradeSql(true)).toContain("continuation_ciphertext = NULL");
  });

  it("remains compatible with Community schema 4", () => {
    expect(completionUpgradeSql(false)).not.toContain("continuation_ciphertext");
  });
});
