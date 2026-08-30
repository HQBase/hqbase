import { describe, expect, it } from "vitest";
import { getDropdownPlacement } from "@/hooks/use-dropdown-placement";

describe("dropdown placement", () => {
  it("uses the lower edge when the menu fits", () => {
    expect(getDropdownPlacement({ bottom: 140, top: 100 }, 240, 800)).toEqual({
      maxHeight: 652,
      side: "bottom"
    });
  });

  it("moves above the trigger near the lower edge", () => {
    expect(getDropdownPlacement({ bottom: 760, top: 720 }, 240, 800)).toEqual({
      maxHeight: 712,
      side: "top"
    });
  });
});
