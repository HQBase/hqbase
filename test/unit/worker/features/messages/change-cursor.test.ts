import { describe, expect, it } from "vitest";

import {
  compareChangeSequences,
  decodeChangeCursor,
  encodeChangeCursor
} from "../../../../../worker/features/messages/change-cursor";

describe("message change cursor", () => {
  it("round-trips a checkpoint and an active high-water cursor", () => {
    expect(decodeChangeCursor(encodeChangeCursor({ after: "12", highWater: null }))).toEqual({
      after: "12",
      highWater: null
    });
    expect(decodeChangeCursor(encodeChangeCursor({ after: "12", highWater: "25" }))).toEqual({
      after: "12",
      highWater: "25"
    });
  });

  it("compares decimal sequences without number precision loss", () => {
    expect(compareChangeSequences("9007199254740992", "9007199254740993")).toBe(-1);
    expect(compareChangeSequences("9007199254740993", "9007199254740993")).toBe(0);
    expect(compareChangeSequences("9007199254740994", "9007199254740993")).toBe(1);
  });

  it("rejects malformed, foreign, reversed, and out-of-range cursors", () => {
    const values = [
      "not-a-cursor",
      encode(["m1", "12", null]),
      encode(["c1", "12", "11"]),
      encode(["c1", "01", null]),
      encode(["c1", "9223372036854775808", null])
    ];
    for (const value of values) {
      expect(() => decodeChangeCursor(value)).toThrowError(/Change cursor is invalid/u);
    }
  });
});

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
