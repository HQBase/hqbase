import { describe, expect, it } from "vitest";

import { normalizeTheme } from "@/features/theme/theme";

describe("appearance theme", () => {
  it("restores only an explicit light preference and otherwise defaults to dark", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("system")).toBe("dark");
    expect(normalizeTheme(null)).toBe("dark");
  });
});
