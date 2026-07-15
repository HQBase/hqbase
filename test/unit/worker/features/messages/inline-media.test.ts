import { isSafeInlineImage } from "@worker/features/messages/routes";
import { describe, expect, it } from "vitest";

describe("inline message media", () => {
  it("allows safe raster images and rejects active or unrelated content", () => {
    expect(isSafeInlineImage("image/png; charset=binary")).toBe(true);
    expect(isSafeInlineImage("image/jpeg")).toBe(true);
    expect(isSafeInlineImage("image/svg+xml")).toBe(false);
    expect(isSafeInlineImage("text/html")).toBe(false);
  });
});
