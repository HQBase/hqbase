import { describe, expect, it } from "vitest";

import {
  compareDraftChangeSequences,
  decodeDraftChangeCursor,
  encodeDraftChangeCursor
} from "../../../../../worker/features/drafts/change-cursor";

describe("draft change cursor", () => {
  const userId = "usr_cursor";

  it("round-trips a checkpoint and an active high-water cursor", () => {
    expect(
      decodeDraftChangeCursor(
        encodeDraftChangeCursor({ after: "12", highWater: null, userId }),
        userId
      )
    ).toEqual({ after: "12", highWater: null, userId });
    expect(
      decodeDraftChangeCursor(
        encodeDraftChangeCursor({ after: "12", highWater: "25", userId }),
        userId
      )
    ).toEqual({ after: "12", highWater: "25", userId });
  });

  it("compares decimal sequences without number precision loss", () => {
    expect(compareDraftChangeSequences("9007199254740992", "9007199254740993")).toBe(-1);
    expect(compareDraftChangeSequences("9007199254740993", "9007199254740993")).toBe(0);
    expect(compareDraftChangeSequences("9007199254740994", "9007199254740993")).toBe(1);
  });

  it("rejects malformed, foreign, reversed, and out-of-range cursors", () => {
    const values = [
      "not-a-cursor",
      encode(["c1", "12", null]),
      encode(["dc1", userId, "12", "11"]),
      encode(["dc1", userId, "01", null]),
      encode(["dc1", userId, "9223372036854775808", null]),
      encode(["dc1", "usr_other", "12", null])
    ];
    for (const value of values) {
      expect(() => decodeDraftChangeCursor(value, userId)).toThrowError(
        /Draft change cursor is invalid/u
      );
    }
  });
});

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
